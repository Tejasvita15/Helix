from functools import lru_cache
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import UploadFile
from faster_whisper import WhisperModel

WHISPER_MODEL_SIZE = "tiny"


class WhisperTranscriber:
    def __init__(self) -> None:
        self.model = WhisperModel(
            WHISPER_MODEL_SIZE,
            device="cpu",
            compute_type="int8",
        )

    def transcribe_path(self, path: Path) -> dict[str, object]:
        segments_iter, info = self.model.transcribe(
            str(path),
            beam_size=1,
            vad_filter=True,
            word_timestamps=True,
        )
        segments = list(segments_iter)
        words: list[dict[str, object]] = []
        transcript_parts: list[str] = []

        for segment in segments:
            transcript_parts.append(segment.text.strip())
            if not segment.words:
                continue
            for word in segment.words:
                start = float(word.start)
                end = float(word.end)
                words.append(
                    {
                        "word": word.word.strip(),
                        "start_sec": round(start, 3),
                        "end_sec": round(end, 3),
                        "duration_sec": round(max(0.0, end - start), 3),
                    }
                )

        gaps: list[float] = []
        for index, word in enumerate(words):
            gap_after = None
            if index + 1 < len(words):
                next_word = words[index + 1]
                gap_after = max(
                    0.0,
                    float(next_word["start_sec"]) - float(word["end_sec"]),
                )
                gaps.append(gap_after)
            word["gap_after_sec"] = None if gap_after is None else round(gap_after, 3)

        average_gap = round(sum(gaps) / len(gaps), 3) if gaps else None

        return {
            "model": f"faster-whisper/{WHISPER_MODEL_SIZE}",
            "language": info.language,
            "language_probability": round(float(info.language_probability), 4),
            "duration_sec": round(float(info.duration), 3),
            "text": " ".join(part for part in transcript_parts if part).strip(),
            "word_count": len(words),
            "average_gap_between_words_sec": average_gap,
            "words": words,
        }


@lru_cache(maxsize=1)
def get_whisper_transcriber() -> WhisperTranscriber:
    return WhisperTranscriber()


async def transcribe_upload(file: UploadFile) -> dict[str, object]:
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    content = await file.read()
    with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(content)
        temp_path = Path(temp_file.name)

    try:
        return get_whisper_transcriber().transcribe_path(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)
