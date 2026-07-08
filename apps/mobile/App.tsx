import { Audio } from "expo-av";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  ImageSourcePropType,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

const API_BASE_URL = "http://127.0.0.1:8000";
const MAX_RECORDING_MS = 5 * 60 * 1000;

type Band = "green" | "amber" | "red";

type StoryPicture = {
  id: string;
  title: string;
  image: ImageSourcePropType;
};

type PersonalizedPictureResponse = {
  use_personalized_generation: boolean;
  generated_image_url: string | null;
  image_prompt: string | null;
  fallback_picture_id: string;
  safety_note: string;
};

type VoiceTaskPayload = {
  session_id: string;
  picture_id: string;
  duration_sec: number;
  pause_count: number;
  long_pause_count: number;
  estimated_word_count: number;
  transcript: string;
  audio_uri: string | null;
  audio_blob?: Blob;
  model_name: string;
  image_prompt: string | null;
};

type WebRecordingState = {
  audioContext: AudioContext;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
  chunks: Float32Array[];
  sampleRate: number;
};

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type VoicePrediction = {
  saved: boolean;
  voice_signal: {
    domain: string;
    band: Band;
    score: number;
    reason: string;
    model?: string;
    disclaimer: string;
  };
  prediction: {
    model: string;
    task: string;
    picture_id: string;
    user_score: number;
    auralis_score_probability: number | null;
    language_domain_score: number;
    band: Band;
    risk_signal: Band;
    average_time_taken_per_word_sec: number | null;
    median_time_taken_per_word_sec: number | null;
    p90_time_taken_per_word_sec: number | null;
    average_gap_between_words_sec: number | null;
    sentence_translated_by_whisper: string;
    whisper_transcript: string;
    image_prompt: string | null;
    features: {
      duration_sec: number;
      pause_count: number;
      long_pause_count: number;
      estimated_word_count: number;
      speech_rate_words_per_min: number;
    };
    clinical_claim: string;
    disclaimer: string;
  };
};

const STORY_PICTURES: StoryPicture[] = [
  {
    id: "hdb-breakfast",
    title: "Morning at home",
    image: require("./assets/picture-story/hdb-breakfast-mobile.png"),
  },
  {
    id: "hawker-lunch",
    title: "Lunch at the hawker centre",
    image: require("./assets/picture-story/hawker-lunch-mobile.png"),
  },
  {
    id: "clinic-waiting",
    title: "Clinic appointment",
    image: require("./assets/picture-story/clinic-waiting-mobile.png"),
  },
  {
    id: "void-deck-exercise",
    title: "Morning exercise",
    image: require("./assets/picture-story/void-deck-exercise-mobile.png"),
  },
  {
    id: "wet-market",
    title: "Market shopping",
    image: require("./assets/picture-story/wet-market-mobile.png"),
  },
  {
    id: "commute-station",
    title: "Public transport errand",
    image: require("./assets/picture-story/commute-station-mobile.png"),
  },
];

const DISCLAIMER =
  "This is not a diagnosis. Please discuss new or worsening concerns with a healthcare professional.";

const DUMMY_USER_DETAILS = {
  age_band: "70-79",
  preferred_language: "English and Mandarin",
  childhood_neighbourhood: "Toa Payoh",
  former_occupation: "primary school teacher",
  hobbies: ["morning walks", "wet market shopping", "cooking for family"],
  familiar_places: ["HDB void deck", "hawker centre", "neighbourhood market"],
  family_context: "adult daughter often accompanies the user on errands",
};

let activeWebRecording: WebRecordingState | null = null;

function getRandomStoryPicture(): StoryPicture {
  return STORY_PICTURES[Math.floor(Math.random() * STORY_PICTURES.length)];
}

function findStoryPicture(id: string): StoryPicture | undefined {
  return STORY_PICTURES.find((picture) => picture.id === id);
}

export default function App() {
  const { width } = useWindowDimensions();
  const [selectedPicture, setSelectedPicture] = useState<StoryPicture>(
    getRandomStoryPicture,
  );
  const [isRecording, setIsRecording] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [statusText, setStatusText] = useState("Ready to begin");
  const [prediction, setPrediction] = useState<VoicePrediction | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const selectedPictureRef = useRef<StoryPicture>(selectedPicture);
  const imagePromptRef = useRef<string | null>(null);
  const isCompact = width < 430;
  const horizontalPadding = isCompact ? 14 : 20;
  const contentWidth = Math.min(width - horizontalPadding * 2, 720);
  const imageHeight = Math.min(
    Math.round(contentWidth * (9 / 16)),
    isCompact ? 190 : 320,
  );

  const bandStyle = useMemo(() => {
    if (!prediction) {
      return styles.bandNeutral;
    }
    return {
      green: styles.bandGreen,
      amber: styles.bandAmber,
      red: styles.bandRed,
    }[prediction.voice_signal.band];
  }, [prediction]);

  useEffect(() => {
    void choosePersonalizedPicture();
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (recordingRef.current) {
        void recordingRef.current.stopAndUnloadAsync();
      }
      void stopWebRecording();
    };
  }, []);

  async function choosePersonalizedPicture() {
    const picture = await getPersonalizedPicture();
    setSelectedPicture(picture.picture);
    selectedPictureRef.current = picture.picture;
    imagePromptRef.current = picture.imagePrompt;
    setImagePrompt(picture.imagePrompt);
  }

  async function startTask() {
    const pictureChoice = await getPersonalizedPicture();
    const randomPicture = pictureChoice.picture;

    try {
      const recording =
        Platform.OS === "web" ? null : await startNativeRecording();
      if (Platform.OS === "web") {
        await startWebRecording();
      }

      setSelectedPicture(randomPicture);
      selectedPictureRef.current = randomPicture;
      imagePromptRef.current = pictureChoice.imagePrompt;
      setImagePrompt(pictureChoice.imagePrompt);
      setPrediction(null);
      setErrorMessage(null);
      setIsRecording(true);
      recordingRef.current = recording;
      const now = Date.now();
      setStartedAt(now);
      startedAtRef.current = now;
      setStatusText("Recording in progress");

      timeoutRef.current = setTimeout(() => {
        void stopTask("auto");
      }, MAX_RECORDING_MS);
    } catch (error) {
      setErrorMessage("Unable to start recording on this device.");
      setStatusText("Ready to begin");
    }
  }

  async function stopTask(endReason: "manual" | "auto") {
    if (
      (!recordingRef.current && !activeWebRecording) ||
      startedAtRef.current === null
    ) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const recording = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    setStatusText(endReason === "auto" ? "Time limit reached" : "Stopped by physician");

    let audioUri: string | null = null;
    let audioBlob: Blob | undefined;
    try {
      if (Platform.OS === "web") {
        audioBlob = await stopWebRecording();
        audioUri = audioBlob ? "browser-recording.wav" : null;
      } else if (recording) {
        await recording.stopAndUnloadAsync();
        audioUri = recording.getURI();
      }
    } catch (error) {
      setErrorMessage("Recording stopped, but the audio file could not be finalized.");
    }

    const durationSec = Math.min(
      300,
      Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
    );
    const payload = buildDemoVoicePayload(
      selectedPictureRef.current.id,
      durationSec,
      audioUri,
      audioBlob,
      imagePromptRef.current,
    );
    startedAtRef.current = null;

    try {
      const json = await submitVoiceTask(payload);
      setPrediction(json);
      setStatusText("Prediction ready");
    } catch (error) {
      setErrorMessage(
        "Backend is not reachable, so showing a local demo prediction instead.",
      );
      setPrediction(buildLocalPrediction(payload));
      setStatusText("Demo prediction ready");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingHorizontal: horizontalPadding },
        ]}
      >
        <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>MindTrail SG</Text>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>
            Picture Story Voice
          </Text>
          <Text style={styles.subtitle}>
            Tell us what is happening in this picture.
          </Text>
        </View>

        <Image
          source={selectedPicture.image}
          style={[styles.storyImage, { height: imageHeight }]}
          resizeMode="cover"
          accessibilityLabel={selectedPicture.title}
        />

        <View style={styles.taskBar}>
          <View>
            <Text style={styles.statusLabel}>Status</Text>
            <Text style={styles.statusValue}>{statusText}</Text>
          </View>
          <View style={[styles.recordingDot, isRecording && styles.recordingDotLive]} />
        </View>

        <View style={styles.controls}>
          <Pressable
            disabled={isRecording}
            onPress={startTask}
            style={({ pressed }) => [
              styles.button,
              styles.primaryButton,
              (pressed || isRecording) && styles.buttonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Start</Text>
          </Pressable>

          <Pressable
            disabled={!isRecording}
            onPress={() => void stopTask("manual")}
            style={({ pressed }) => [
              styles.button,
              styles.stopButton,
              (pressed || !isRecording) && styles.buttonPressed,
            ]}
          >
            <Text style={styles.stopButtonText}>Stop</Text>
          </Pressable>
        </View>

        <View style={styles.notePanel}>
          <Text style={styles.noteText}>
            The timer runs silently and ends the task automatically after 5
            minutes. This MVP records an audio URI and submits speech metadata in
            the same JSON shape expected from the Auralis/NatHACKS_Auralis voice
            model.
          </Text>
        </View>

        {imagePrompt ? (
          <View style={styles.promptPanel}>
            <Text style={styles.promptLabel}>Personalized image prompt</Text>
            <Text style={styles.promptText}>{imagePrompt}</Text>
          </View>
        ) : null}

        {prediction ? (
          <View style={styles.resultPanel}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>Language signal</Text>
              <Text style={[styles.band, bandStyle]}>
                {prediction.voice_signal.band.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.score}>
              Score {prediction.voice_signal.score}/100
            </Text>
            <Text style={styles.reason}>{prediction.voice_signal.reason}</Text>
            <Text style={styles.jsonLabel}>JSON prediction</Text>
            <Text style={styles.jsonText}>
              {JSON.stringify(prediction.prediction, null, 2)}
            </Text>
          </View>
        ) : null}

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function buildDemoVoicePayload(
  pictureId: string,
  durationSec: number,
  audioUri: string | null,
  audioBlob?: Blob,
  imagePrompt?: string | null,
): VoiceTaskPayload {
  return {
    session_id: "demo-session-001",
    picture_id: pictureId,
    duration_sec: durationSec,
    pause_count: 0,
    long_pause_count: 0,
    estimated_word_count: 0,
    transcript: "",
    audio_uri: audioUri,
    audio_blob: audioBlob,
    model_name: "Auralis/NatHACKS_Auralis",
    image_prompt: imagePrompt ?? null,
  };
}

function buildLocalPrediction(payload: VoiceTaskPayload): VoicePrediction {
  const speechRate =
    payload.duration_sec > 0
      ? Math.round(payload.estimated_word_count / (payload.duration_sec / 60))
      : 0;
  const score = Math.max(
    0,
    Math.min(100, 100 - payload.long_pause_count * 8 - payload.pause_count * 2),
  );
  const band: Band = score >= 75 ? "green" : score >= 50 ? "amber" : "red";

  return {
    saved: false,
    voice_signal: {
      domain: "language",
      band,
      score,
      reason: `Local demo estimate from ${payload.long_pause_count} long pauses, ${payload.estimated_word_count} estimated words, and ${speechRate} words per minute.`,
      model: payload.model_name,
      disclaimer: DISCLAIMER,
    },
    prediction: {
      model: payload.model_name,
      task: "picture_story_voice",
      picture_id: payload.picture_id,
      user_score: score,
      auralis_score_probability: null,
      language_domain_score: score,
      band,
      risk_signal: band,
      average_time_taken_per_word_sec: null,
      median_time_taken_per_word_sec: null,
      p90_time_taken_per_word_sec: null,
      average_gap_between_words_sec: null,
      sentence_translated_by_whisper: payload.transcript,
      whisper_transcript: payload.transcript,
      image_prompt: payload.image_prompt,
      features: {
        duration_sec: payload.duration_sec,
        pause_count: payload.pause_count,
        long_pause_count: payload.long_pause_count,
        estimated_word_count: payload.estimated_word_count,
        speech_rate_words_per_min: speechRate,
      },
      clinical_claim: "possible language-domain signal only",
      disclaimer: DISCLAIMER,
    },
  };
}

async function submitVoiceTask(payload: VoiceTaskPayload): Promise<VoicePrediction> {
  if (payload.audio_uri || payload.audio_blob) {
    try {
      const formData = new FormData();
      formData.append("session_id", payload.session_id);
      formData.append("picture_id", payload.picture_id);
      if (payload.image_prompt) {
        formData.append("image_prompt", payload.image_prompt);
      }

      if (payload.audio_blob) {
        formData.append("file", payload.audio_blob, "voice-task.wav");
      } else if (payload.audio_uri?.startsWith("blob:")) {
        const audioResponse = await fetch(payload.audio_uri);
        const audioBlob = await audioResponse.blob();
        formData.append("file", audioBlob, "voice-task.webm");
      } else {
        formData.append(
          "file",
          {
            uri: payload.audio_uri,
            name: "voice-task.m4a",
            type: "audio/m4a",
          } as unknown as Blob,
        );
      }

      const audioResponse = await fetch(`${API_BASE_URL}/task/voice/audio`, {
        method: "POST",
        body: formData,
      });

      if (audioResponse.ok) {
        return (await audioResponse.json()) as VoicePrediction;
      }
    } catch (error) {
      // Fall through to the metadata endpoint so the demo remains usable.
    }
  }

  const response = await fetch(`${API_BASE_URL}/task/voice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  return (await response.json()) as VoicePrediction;
}

async function getPersonalizedPicture(): Promise<{
  picture: StoryPicture;
  imagePrompt: string | null;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/picture-story/personalized`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: "demo-session-001",
        details: DUMMY_USER_DETAILS,
      }),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const json = (await response.json()) as PersonalizedPictureResponse;
    const fallbackPicture =
      findStoryPicture(json.fallback_picture_id) ?? getRandomStoryPicture();

    if (json.generated_image_url) {
      return {
        picture: {
          id: "generated-reminiscence",
          title: "Personalized reminiscence scene",
          image: { uri: json.generated_image_url },
        },
        imagePrompt: json.image_prompt,
      };
    }

    return {
      picture: fallbackPicture,
      imagePrompt: json.image_prompt,
    };
  } catch (error) {
    return {
      picture: getRandomStoryPicture(),
      imagePrompt: null,
    };
  }
}

async function startNativeRecording(): Promise<Audio.Recording> {
  const permission = await Audio.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Microphone permission denied.");
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY,
  );
  return recording;
}

async function startWebRecording(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Browser microphone recording is not supported.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextCtor();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  activeWebRecording = {
    audioContext,
    processor,
    source,
    stream,
    chunks,
    sampleRate: audioContext.sampleRate,
  };
}

async function stopWebRecording(): Promise<Blob | undefined> {
  const recording = activeWebRecording;
  if (!recording) {
    return undefined;
  }

  activeWebRecording = null;
  recording.processor.disconnect();
  recording.source.disconnect();
  recording.stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
  await recording.audioContext.close();

  const samples = mergeAudioChunks(recording.chunks);
  return encodeWav(samples, recording.sampleRate);
}

function mergeAudioChunks(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Float32Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f6f7f2",
  },
  container: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 32,
  },
  content: {
    width: "100%",
  },
  header: {
    marginBottom: 12,
  },
  eyebrow: {
    color: "#25636f",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 6,
    color: "#17202a",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0,
  },
  titleCompact: {
    fontSize: 26,
    lineHeight: 31,
  },
  subtitle: {
    marginTop: 8,
    color: "#3f4f46",
    fontSize: 18,
    lineHeight: 25,
  },
  storyImage: {
    width: "100%",
    borderRadius: 8,
    backgroundColor: "#d6ddd6",
  },
  taskBar: {
    minHeight: 72,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderColor: "#d9e1da",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusLabel: {
    color: "#5b6b61",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  statusValue: {
    marginTop: 4,
    color: "#18231f",
    fontSize: 18,
    fontWeight: "700",
  },
  recordingDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#b7c1ba",
  },
  recordingDotLive: {
    backgroundColor: "#b91c1c",
  },
  controls: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  button: {
    minHeight: 54,
    flex: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: "#1f6f64",
  },
  stopButton: {
    backgroundColor: "#fff7ed",
    borderColor: "#c2410c",
    borderWidth: 1,
  },
  buttonPressed: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
  stopButtonText: {
    color: "#9a3412",
    fontSize: 18,
    fontWeight: "800",
  },
  notePanel: {
    marginTop: 16,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#eef6f1",
  },
  noteText: {
    color: "#33443a",
    fontSize: 14,
    lineHeight: 21,
  },
  promptPanel: {
    marginTop: 12,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    borderColor: "#dbe3ea",
    borderWidth: 1,
  },
  promptLabel: {
    color: "#17202a",
    fontSize: 14,
    fontWeight: "800",
  },
  promptText: {
    marginTop: 6,
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
  },
  resultPanel: {
    marginTop: 18,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderColor: "#d9e1da",
    borderWidth: 1,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  resultTitle: {
    color: "#17202a",
    fontSize: 20,
    fontWeight: "800",
  },
  band: {
    minWidth: 78,
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
  },
  bandNeutral: {
    backgroundColor: "#e5e7eb",
    color: "#374151",
  },
  bandGreen: {
    backgroundColor: "#dcfce7",
    color: "#166534",
  },
  bandAmber: {
    backgroundColor: "#fef3c7",
    color: "#92400e",
  },
  bandRed: {
    backgroundColor: "#fee2e2",
    color: "#991b1b",
  },
  score: {
    marginTop: 10,
    color: "#17202a",
    fontSize: 17,
    fontWeight: "700",
  },
  reason: {
    marginTop: 8,
    color: "#3f4f46",
    fontSize: 15,
    lineHeight: 22,
  },
  jsonLabel: {
    marginTop: 14,
    color: "#17202a",
    fontSize: 14,
    fontWeight: "800",
  },
  jsonText: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#111827",
    color: "#f9fafb",
    fontSize: 12,
    lineHeight: 18,
  },
  error: {
    marginTop: 14,
    color: "#9a3412",
    fontSize: 14,
    lineHeight: 20,
  },
  disclaimer: {
    marginTop: 20,
    color: "#4b5563",
    fontSize: 14,
    lineHeight: 21,
  },
});
