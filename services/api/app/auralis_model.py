from functools import lru_cache
from pathlib import Path
from tempfile import NamedTemporaryFile

import librosa
import torch
from fastapi import UploadFile
from torch import nn
from transformers import AutoConfig, AutoFeatureExtractor
from transformers.modeling_outputs import SequenceClassifierOutput
from transformers.models.wav2vec2.modeling_wav2vec2 import (
    Wav2Vec2Model,
    Wav2Vec2PreTrainedModel,
)

MODEL_ID = "Auralis/NatHACKS_Auralis"
TARGET_SAMPLE_RATE = 16_000


class Wav2Vec2ClassificationHead(nn.Module):
    def __init__(self, config) -> None:
        super().__init__()
        self.dense = nn.Linear(config.hidden_size, config.hidden_size)
        self.dropout = nn.Dropout(config.final_dropout)
        self.out_proj = nn.Linear(config.hidden_size, config.num_labels)

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        x = self.dropout(features)
        x = self.dense(x)
        x = torch.tanh(x)
        x = self.dropout(x)
        return self.out_proj(x)


class Wav2Vec2ForSpeechClassification(Wav2Vec2PreTrainedModel):
    def __init__(self, config) -> None:
        super().__init__(config)
        self.wav2vec2 = Wav2Vec2Model(config)
        self.classifier = Wav2Vec2ClassificationHead(config)
        self.init_weights()

    def freeze_feature_extractor(self) -> None:
        self.wav2vec2.feature_extractor._freeze_parameters()

    def merged_strategy(
        self,
        hidden_states: torch.Tensor,
        mode: str = "mean",
    ) -> torch.Tensor:
        if mode == "sum":
            return torch.sum(hidden_states, dim=1)
        if mode == "max":
            return torch.max(hidden_states, dim=1)[0]
        return torch.mean(hidden_states, dim=1)

    def forward(
        self,
        input_values: torch.Tensor,
        attention_mask: torch.Tensor | None = None,
        labels: torch.Tensor | None = None,
    ) -> SequenceClassifierOutput:
        outputs = self.wav2vec2(input_values, attention_mask=attention_mask)
        hidden_states = outputs[0]
        hidden_states = self.merged_strategy(
            hidden_states,
            mode=getattr(self.config, "pooling_mode", "mean"),
        )
        logits = self.classifier(hidden_states)

        loss = None
        if labels is not None:
            loss = nn.CrossEntropyLoss()(logits.view(-1, self.config.num_labels), labels.view(-1))

        return SequenceClassifierOutput(
            loss=loss,
            logits=logits,
            hidden_states=outputs.hidden_states,
            attentions=outputs.attentions,
        )


class AuralisModel:
    def __init__(self) -> None:
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.config = AutoConfig.from_pretrained(MODEL_ID, local_files_only=True)
        self.feature_extractor = AutoFeatureExtractor.from_pretrained(
            MODEL_ID,
            local_files_only=True,
        )
        self.model = Wav2Vec2ForSpeechClassification.from_pretrained(
            MODEL_ID,
            config=self.config,
            local_files_only=True,
        ).to(self.device)
        self.model.eval()

    def predict_path(self, path: Path) -> dict[str, object]:
        audio, sample_rate = librosa.load(path, sr=TARGET_SAMPLE_RATE, mono=True)
        duration_sec = float(len(audio) / sample_rate) if sample_rate else 0.0
        rms = float((audio**2).mean() ** 0.5) if len(audio) else 0.0
        peak = float(abs(audio).max()) if len(audio) else 0.0
        if duration_sec < 1.0 or rms < 0.0015 or peak < 0.01:
            return {
                "model": MODEL_ID,
                "device": str(self.device),
                "top_label": "no_usable_speech",
                "top_score": 1.0,
                "scores": [],
                "audio_quality": {
                    "duration_sec": duration_sec,
                    "rms": rms,
                    "peak": peak,
                    "is_silent": True,
                },
            }

        inputs = self.feature_extractor(
            audio,
            sampling_rate=sample_rate,
            return_tensors="pt",
            padding=True,
        )
        input_values = inputs["input_values"].to(self.device)
        attention_mask = inputs.get("attention_mask")
        if attention_mask is not None:
            attention_mask = attention_mask.to(self.device)

        with torch.no_grad():
            logits = self.model(
                input_values=input_values,
                attention_mask=attention_mask,
            ).logits
            probabilities = torch.softmax(logits, dim=-1)[0].cpu()

        scored_labels = [
            {
                "label": self.config.id2label[index],
                "score": float(probabilities[index]),
            }
            for index in range(len(probabilities))
        ]
        scored_labels.sort(key=lambda item: item["score"], reverse=True)
        return {
            "model": MODEL_ID,
            "device": str(self.device),
            "top_label": scored_labels[0]["label"],
            "top_score": scored_labels[0]["score"],
            "scores": scored_labels,
            "audio_quality": {
                "duration_sec": duration_sec,
                "rms": rms,
                "peak": peak,
                "is_silent": False,
            },
        }


@lru_cache(maxsize=1)
def get_auralis_model() -> AuralisModel:
    return AuralisModel()


async def predict_upload(file: UploadFile) -> dict[str, object]:
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    content = await file.read()
    with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(content)
        temp_path = Path(temp_file.name)

    try:
        return get_auralis_model().predict_path(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)
