import { Audio } from "expo-av";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
<<<<<<< HEAD
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
=======
  ActivityIndicator,
  Alert,
  GestureResponderEvent,
  Image,
  ImageSourcePropType,
  NativeModules,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import {
  createHawkerMemoryTask,
  getHawkerFoodVisual,
  HawkerMemoryAnswer,
  HawkerMemoryQuestion,
  HawkerMemoryResult,
  HawkerMemoryTask,
  scoreHawkerMemoryTask,
} from "./src/hawkerMemory";

type Screen =
  | "welcome"
  | "consent"
  | "profile"
  | "checklist"
  | "memoryIntro"
  | "memoryStudy"
  | "voice"
  | "memoryRecall"
  | "drawing"
  | "results"
  | "report";

type Band = "green" | "amber" | "red";
type SignalBand = "low_signal" | "medium_signal" | "higher_signal" | "uncertain";

type Signal = {
  domain: string;
  band: Band;
  score: number;
  reason: string;
  model?: string;
};

type StoryPicture = {
  id: string;
  title: string;
  image: ImageSourcePropType;
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
  image_prompt?: string | null;
};

type VoicePrediction = {
  saved: boolean;
  voice_signal: Signal;
  prediction: {
    model: string;
    task: string;
    picture_id: string;
    language_domain_score: number;
    band: Band;
    risk_signal: Band;
    features?: Record<string, number>;
    transcription?: {
      text?: string;
      word_count?: number;
      warning?: string;
    };
    clinical_claim: string;
    disclaimer: string;
  };
};

type BackendMemoryScoreResponse = {
  task_id: "hawker_memory_v1";
  score: number;
  max_score: number;
  accuracy: number;
  correct_count: number;
  incorrect_count: number;
  avg_response_time_ms: number | null;
  flags: string[];
  summary: string;
  domain: "memory_recall";
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

type ScoreSummary = {
  session_id: string;
  overall_band: Band;
  domain_signals: Record<string, Signal>;
  recommendations: string[];
  disclaimer: string;
};

type Point = {
  x: number;
  y: number;
  t: number;
};

type DrawingStroke = {
  points: Point[];
};

type DrawingTaskPrompt = {
  task_id: "clock_drawing";
  instruction: string;
};

type DrawingScoreResult = {
  task: "clock_drawing";
  task_completed: boolean;
  signal_band: SignalBand;
  confidence: number;
  domains: string[];
  explanation: string;
  report_summary: string;
  model_version: string;
  scoring_mode: string;
  reason?: string;
};

type DrawingScorePayload = {
  task_id: "clock_drawing";
  session_id: string;
  instruction: string;
  canvas: {
    width: number;
    height: number;
  };
  strokes: DrawingStroke[];
  metadata: {
    completion_time_ms: number;
    clear_count: number;
    undo_count: number;
    device: "mobile";
  };
};

type ChecklistKey =
  | "repeated_questions"
  | "missed_medication"
  | "missed_appointments"
  | "getting_lost"
  | "money_or_bills_difficulty"
  | "family_concerned";

const DISCLAIMER =
  "This is not a diagnosis. Please discuss new or worsening concerns with a healthcare professional.";

const DEFAULT_DRAWING_TASK: DrawingTaskPrompt = {
  task_id: "clock_drawing",
  instruction: "Draw a clock shown by the prompt.",
};
const MIN_LOCAL_DRAWING_POINTS = 20;
const MAX_RECORDING_MS = 5 * 60 * 1000;
const DEFAULT_MEMORY_STUDY_SECONDS = 20;

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

let activeWebRecording: WebRecordingState | null = null;

function getRandomStoryPicture(): StoryPicture {
  return STORY_PICTURES[Math.floor(Math.random() * STORY_PICTURES.length)];
}

function getApiBaseUrl() {
  if (Platform.OS === "web") {
    return "http://localhost:8000";
  }

  // TODO: For physical device demos, configure this with the host machine IP.
  const scriptUrl = NativeModules.SourceCode?.scriptURL as string | undefined;
  const match = scriptUrl?.match(/https?:\/\/([^:/]+)/);
  if (match?.[1]) {
    return `http://${match[1]}:8000`;
  }

  return Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://127.0.0.1:8000";
}

const API_BASE_URL = getApiBaseUrl();

const checklistLabels: Array<{ key: ChecklistKey; label: string }> = [
  { key: "repeated_questions", label: "Repeats questions more often" },
  { key: "missed_medication", label: "Missed medication recently" },
  { key: "missed_appointments", label: "Missed appointments" },
  { key: "getting_lost", label: "Got lost in familiar places" },
  { key: "money_or_bills_difficulty", label: "New difficulty handling money or bills" },
  { key: "family_concerned", label: "Family is concerned" },
];

const initialChecklist: Record<ChecklistKey, boolean> = {
  repeated_questions: false,
  missed_medication: false,
  missed_appointments: false,
  getting_lost: false,
  money_or_bills_difficulty: false,
  family_concerned: false,
};

function bandColor(band: Band) {
  if (band === "red") {
    return "#b91c1c";
  }
  if (band === "amber") {
    return "#b45309";
  }
  return "#047857";
}

function bandLabel(band: Band) {
  if (band === "red") {
    return "Discuss with GP";
  }
  if (band === "amber") {
    return "Monitor";
  }
  return "No strong signal";
}

function signalBandLabel(signalBand: SignalBand) {
  if (signalBand === "low_signal") {
    return "Low signal";
  }
  if (signalBand === "medium_signal") {
    return "Medium signal";
  }
  if (signalBand === "higher_signal") {
    return "Higher signal";
  }
  return "Uncertain";
}

function signalBandColor(signalBand: SignalBand) {
  if (signalBand === "higher_signal") {
    return "#b45309";
  }
  if (signalBand === "medium_signal") {
    return "#0f766e";
  }
  if (signalBand === "low_signal") {
    return "#047857";
  }
  return "#57534e";
}

function drawingStatusLabel(result: DrawingScoreResult) {
  if (!result.task_completed) {
    return "Task incomplete";
  }
  if (result.signal_band === "uncertain") {
    return "Unable to score reliably";
  }
  return "Task scored";
}

function logDrawingPayloadForDev(payload: DrawingScorePayload) {
  if (typeof __DEV__ === "undefined" || !__DEV__) {
    return;
  }

  console.log("Clock drawing payload shape", {
    task_id: payload.task_id,
    canvas: payload.canvas,
    stroke_count: payload.strokes.length,
    point_count: payload.strokes.reduce((total, stroke) => total + stroke.points.length, 0),
    first_stroke_point_count: payload.strokes[0]?.points.length ?? 0,
    metadata: payload.metadata,
  });
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
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
      } else if (payload.audio_uri) {
        formData.append(
          "file",
          {
            uri: payload.audio_uri,
            name: "voice-task.m4a",
            type: "audio/m4a",
          } as unknown as Blob,
        );
      }

      const response = await fetch(`${API_BASE_URL}/task/voice/audio`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        return (await response.json()) as VoicePrediction;
      }
    } catch (error) {
      // Fall through to the metadata endpoint so the demo remains usable.
    }
  }

  return postJson<VoicePrediction>("/task/voice", payload);
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

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function ScreenShell({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.brand}>MindTrail SG</Text>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      {children}
      <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
    </ScrollView>
  );
}

function Segment({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.segment, selected && styles.segmentSelected]}
    >
      <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function LineSegment({ start, end }: { start: Point; end: Point }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const angle = `${Math.atan2(dy, dx)}rad`;
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.strokeLine,
        {
          left: midX - length / 2,
          top: midY - 2,
          width: length,
          transform: [{ rotate: angle }],
        },
      ]}
    />
  );
}

function DrawingResultCard({ result }: { result: DrawingScoreResult }) {
  return (
    <View style={styles.signalCard}>
      <View style={styles.signalHeader}>
        <Text style={styles.signalDomain}>Clock drawing</Text>
        <Text
          style={[
            styles.bandPill,
            {
              color: signalBandColor(result.signal_band),
              borderColor: signalBandColor(result.signal_band),
            },
          ]}
        >
          {signalBandLabel(result.signal_band)}
        </Text>
      </View>
      <Text style={styles.statusText}>{drawingStatusLabel(result)}</Text>
      <Text style={styles.signalReason}>{result.explanation}</Text>
      <Text style={styles.metaText}>{result.report_summary}</Text>
    </View>
  );
}

function MemoryResultCard({ result }: { result: HawkerMemoryResult }) {
  return (
    <View style={styles.signalCard}>
      <View style={styles.signalHeader}>
        <Text style={styles.signalDomain}>Memory recall game</Text>
        <Text style={[styles.bandPill, { color: "#0f766e", borderColor: "#0f766e" }]}>
          {result.correctCount}/{result.maxScore}
        </Text>
      </View>
      <Text style={styles.statusText}>Recall accuracy: {Math.round(result.accuracy * 100)}%</Text>
      <Text style={styles.signalReason}>{result.summary}</Text>
      <Text style={styles.metaText}>Domain: memory recall</Text>
    </View>
  );
}

function FoodVisual({
  emoji,
  image,
  label,
  size = "small",
}: {
  emoji: string;
  image?: ImageSourcePropType;
  label: string;
  size?: "small" | "medium" | "large";
}) {
  const isMedium = size === "medium";
  const isLarge = size === "large";

  return (
    <View
      accessibilityLabel={`${label} image`}
      style={[
        styles.foodVisual,
        isMedium && styles.foodVisualMedium,
        isLarge && styles.foodVisualLarge,
      ]}
    >
      {image ? (
        <Image resizeMode="cover" source={image} style={styles.foodImage} />
      ) : (
        <Text
          style={[
            styles.foodEmoji,
            isMedium && styles.foodEmojiMedium,
            isLarge && styles.foodEmojiLarge,
          ]}
        >
          {emoji}
        </Text>
      )}
    </View>
  );
}

function MemoryAnswerOption({ label, onPress }: { label: string; onPress: () => void }) {
  const foodVisual = getHawkerFoodVisual(label);
  const { width: screenWidth } = useWindowDimensions();
  const isCompactMemoryLayout = screenWidth < 390;
  const isFoodOption = Boolean(foodVisual);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.memoryOption,
        isFoodOption && styles.memoryFoodTile,
        isFoodOption && (isCompactMemoryLayout ? styles.memoryFoodTileCompact : styles.memoryFoodTileWide),
        pressed && styles.memoryOptionPressed,
      ]}
    >
      {foodVisual ? (
        <FoodVisual
          emoji={foodVisual.emoji}
          image={foodVisual.image}
          label={foodVisual.label}
          size="medium"
        />
      ) : (
        <View style={styles.personOptionIcon}>
          <Text style={styles.personOptionInitial}>{label.charAt(0)}</Text>
        </View>
      )}
      <Text style={[styles.memoryOptionText, isFoodOption && styles.memoryFoodTileText]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function App() {
  const { width: screenWidth } = useWindowDimensions();
  const [screen, setScreen] = useState<Screen>("welcome");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [drawingTask, setDrawingTask] = useState<DrawingTaskPrompt>(DEFAULT_DRAWING_TASK);
  const [ageBand, setAgeBand] = useState("65-74");
  const [language, setLanguage] = useState("English");
  const [education, setEducation] = useState("Secondary");
  const [caregiverAssisted, setCaregiverAssisted] = useState(true);
  const [checklist, setChecklist] = useState(initialChecklist);
  const [moodChange, setMoodChange] = useState("unsure");
  const [selectedPicture, setSelectedPicture] = useState<StoryPicture>(getRandomStoryPicture);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Ready to begin");
  const [voicePrediction, setVoicePrediction] = useState<VoicePrediction | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [clearCount, setClearCount] = useState(0);
  const [undoCount] = useState(0);
  const [drawingStartedAt, setDrawingStartedAt] = useState(Date.now());
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 320, height: 320 });
  const [drawingScoreResult, setDrawingScoreResult] = useState<DrawingScoreResult | null>(null);
  const [drawingSubmitState, setDrawingSubmitState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [drawingError, setDrawingError] = useState("");
  const [drawingSignal, setDrawingSignal] = useState<Signal | null>(null);
  const [scoreSummary, setScoreSummary] = useState<ScoreSummary | null>(null);
  const [memoryTask, setMemoryTask] = useState<HawkerMemoryTask>(() =>
    createHawkerMemoryTask("demo-session-001"),
  );
  const [memoryCountdown, setMemoryCountdown] = useState(DEFAULT_MEMORY_STUDY_SECONDS);
  const [memoryAnswers, setMemoryAnswers] = useState<HawkerMemoryAnswer[]>([]);
  const [memoryQuestionIndex, setMemoryQuestionIndex] = useState(0);
  const [memoryQuestionStartedAt, setMemoryQuestionStartedAt] = useState<number | null>(null);
  const [memoryStartedAt, setMemoryStartedAt] = useState<string | null>(null);
  const [memoryResult, setMemoryResult] = useState<HawkerMemoryResult | null>(null);
  const isDrawingRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const voiceStartedAtRef = useRef<number | null>(null);
  const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedPictureRef = useRef<StoryPicture>(selectedPicture);
  const canvasSize = 320;
  const isCompactMemoryLayout = screenWidth < 390;
  const studyFoodVisualSize = isCompactMemoryLayout ? "medium" : "large";
  const currentMemoryQuestion = memoryTask.questions[memoryQuestionIndex];
  const memoryProgressText = `${Math.min(memoryQuestionIndex + 1, memoryTask.questions.length)} of ${memoryTask.questions.length}`;

  useEffect(() => {
    if (screen === "drawing") {
      setDrawingStartedAt(Date.now());
      setDrawingSubmitState("idle");
      setDrawingError("");
    }
  }, [screen]);

  useEffect(() => {
    selectedPictureRef.current = selectedPicture;
  }, [selectedPicture]);

  useEffect(() => {
    if (screen !== "memoryStudy" || memoryCountdown <= 0) {
      return undefined;
    }

    const timer = setInterval(() => {
      setMemoryCountdown((seconds) => Math.max(seconds - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [memoryCountdown, screen]);

  useEffect(() => {
    return () => {
      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
      }
      if (recordingRef.current) {
        void recordingRef.current.stopAndUnloadAsync();
      }
      void stopWebRecording();
    };
  }, []);

  const elapsedDrawingSeconds = () =>
    Math.max(1, Math.round((Date.now() - drawingStartedAt) / 1000));

  const startStroke = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    if (!isPointInsideCanvas(locationX, locationY)) {
      isDrawingRef.current = false;
      return;
    }
    isDrawingRef.current = true;
    const t = Date.now() - drawingStartedAt;
    setStrokes((current) => [...current, { points: [{ x: locationX, y: locationY, t }] }]);
  };

  const addPoint = (event: GestureResponderEvent) => {
    if (!isDrawingRef.current) {
      return;
    }
    const { locationX, locationY } = event.nativeEvent;
    if (!isPointInsideCanvas(locationX, locationY)) {
      isDrawingRef.current = false;
      return;
    }
    const t = Date.now() - drawingStartedAt;
    setStrokes((current) => {
      if (current.length === 0) {
        return [{ points: [{ x: locationX, y: locationY, t }] }];
      }
      const next = [...current];
      const lastStroke = next[next.length - 1];
      const lastPoint = lastStroke.points[lastStroke.points.length - 1];
      if (lastPoint && Math.abs(lastPoint.x - locationX) + Math.abs(lastPoint.y - locationY) < 2) {
        return current;
      }
      next[next.length - 1] = { points: [...lastStroke.points, { x: locationX, y: locationY, t }] };
      return next;
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: startStroke,
        onPanResponderMove: addPoint,
        onPanResponderRelease: () => {
          isDrawingRef.current = false;
        },
        onPanResponderTerminate: () => {
          isDrawingRef.current = false;
        },
      }),
    [drawingStartedAt, canvasDimensions.height, canvasDimensions.width],
  );

  const validDrawingPointCount = () => strokes.reduce((total, stroke) => total + stroke.points.length, 0);

  const isPointInsideCanvas = (x: number, y: number) =>
    x >= 0 && y >= 0 && x <= canvasDimensions.width && y <= canvasDimensions.height;

  const resetMemoryTask = (seed: string) => {
    setMemoryTask(createHawkerMemoryTask(seed));
    setMemoryCountdown(DEFAULT_MEMORY_STUDY_SECONDS);
    setMemoryAnswers([]);
    setMemoryQuestionIndex(0);
    setMemoryQuestionStartedAt(null);
    setMemoryStartedAt(null);
    setMemoryResult(null);
  };

  const startMemoryStudy = () => {
    setMemoryCountdown(DEFAULT_MEMORY_STUDY_SECONDS);
    setMemoryAnswers([]);
    setMemoryQuestionIndex(0);
    setMemoryQuestionStartedAt(null);
    setMemoryStartedAt(new Date().toISOString());
    setMemoryResult(null);
    setScreen("memoryStudy");
  };

  const startMemoryRecall = () => {
    setMemoryQuestionIndex(0);
    setMemoryQuestionStartedAt(Date.now());
    setScreen(currentMemoryQuestion ? "memoryRecall" : "memoryIntro");
  };

  const mapBackendMemoryResult = (result: BackendMemoryScoreResponse): HawkerMemoryResult => ({
    taskId: result.task_id,
    score: result.score,
    maxScore: result.max_score,
    accuracy: result.accuracy,
    correctCount: result.correct_count,
    incorrectCount: result.incorrect_count,
    avgResponseTimeMs: result.avg_response_time_ms,
    flags: result.flags,
    summary: result.summary,
    domain: result.domain,
  });

  const finishMemoryScoring = async (nextAnswers: HawkerMemoryAnswer[]) => {
    const completedAt = new Date().toISOString();
    const localResult = scoreHawkerMemoryTask(memoryTask.questions, nextAnswers);
    setMemoryResult(localResult);

    if (!sessionId) {
      setScreen("drawing");
      return;
    }

    try {
      const response = await postJson<BackendMemoryScoreResponse>("/task/memory/score", {
        session_id: sessionId,
        task_id: memoryTask.taskId,
        study_items: memoryTask.studyItems.map((item) => ({
          person: item.person,
          item: item.item,
        })),
        questions: memoryTask.questions.map((question) => {
          const answer = nextAnswers.find((item) => item.questionId === question.questionId);
          return {
            question_id: question.questionId,
            type: question.type,
            prompt: question.prompt,
            correct_answer: question.correctAnswer,
            selected_answer: answer?.selectedAnswer ?? null,
            response_time_ms: answer?.responseTimeMs ?? null,
          };
        }),
        started_at: memoryStartedAt,
        completed_at: completedAt,
        device: {
          platform: Platform.OS,
          app_version: "demo",
        },
      });
      setMemoryResult(mapBackendMemoryResult(response));
    } catch (error) {
      setMemoryResult(localResult);
    } finally {
      setScreen("drawing");
    }
  };

  const selectMemoryAnswer = (question: HawkerMemoryQuestion, selectedAnswer: string) => {
    const responseTimeMs =
      memoryQuestionStartedAt === null ? 0 : Date.now() - memoryQuestionStartedAt;
    const nextAnswers = [
      ...memoryAnswers,
      {
        questionId: question.questionId,
        selectedAnswer,
        responseTimeMs,
      },
    ];

    setMemoryAnswers(nextAnswers);

    if (memoryQuestionIndex + 1 >= memoryTask.questions.length) {
      void finishMemoryScoring(nextAnswers);
      return;
    }

    setMemoryQuestionIndex((index) => index + 1);
    setMemoryQuestionStartedAt(Date.now());
  };

  const startSession = async () => {
    setLoading(true);
    try {
      const response = await postJson<{ session_id: string; drawing_task: DrawingTaskPrompt }>(
        "/session/start",
        {
        age_band: ageBand,
        preferred_language: language,
        education_band: education,
        caregiver_assisted: caregiverAssisted,
        },
      );
      setSessionId(response.session_id);
      setDrawingTask(response.drawing_task);
      setStrokes([]);
      setClearCount(0);
      setDrawingScoreResult(null);
      setDrawingSubmitState("idle");
      setDrawingError("");
      setDrawingSignal(null);
      setScoreSummary(null);
      setVoicePrediction(null);
      setVoiceError("");
      setVoiceStatus("Ready to begin");
      resetMemoryTask(response.session_id);
      setScreen("checklist");
    } catch (error) {
      Alert.alert("Backend not reachable", `Start FastAPI at ${API_BASE_URL}, then try again.`);
    } finally {
      setLoading(false);
    }
  };

  const saveChecklist = async () => {
    if (!sessionId) {
      return;
    }
    setLoading(true);
    try {
      await postJson("/caregiver-checklist", {
        session_id: sessionId,
        ...checklist,
        mood_or_personality_change: moodChange,
      });
      setScreen("memoryIntro");
    } catch (error) {
      Alert.alert("Could not save checklist", "Please check that the API server is running.");
    } finally {
      setLoading(false);
    }
  };

  const submitVoiceDemo = async () => {
    if (!sessionId) {
      return;
    }
    setLoading(true);
    try {
      const response = await submitVoiceTask({
        session_id: sessionId,
        picture_id: selectedPicture.id,
        duration_sec: 40,
        pause_count: 4,
        long_pause_count: 1,
        estimated_word_count: 68,
        transcript: "Demo picture story response captured as mock metadata for the MVP.",
        audio_uri: null,
        model_name: "Auralis/NatHACKS_Auralis",
      });
      setVoicePrediction(response);
      setDrawingSignal(response.voice_signal);
      startMemoryRecall();
    } catch (error) {
      Alert.alert("Could not save voice task", "Please check that the API server is running.");
    } finally {
      setLoading(false);
    }
  };

  const startVoiceRecording = async () => {
    if (!sessionId) {
      return;
    }

    const picture = getRandomStoryPicture();
    setSelectedPicture(picture);
    selectedPictureRef.current = picture;
    setVoicePrediction(null);
    setVoiceError("");
    setVoiceStatus("Starting recording...");

    try {
      const recording = Platform.OS === "web" ? null : await startNativeRecording();
      if (Platform.OS === "web") {
        await startWebRecording();
      }
      recordingRef.current = recording;
      voiceStartedAtRef.current = Date.now();
      setIsRecording(true);
      setVoiceStatus("Recording in progress");
      voiceTimeoutRef.current = setTimeout(() => {
        void stopVoiceRecording("auto");
      }, MAX_RECORDING_MS);
    } catch (error) {
      setVoiceStatus("Ready to begin");
      setVoiceError("Unable to start recording on this device.");
    }
  };

  const stopVoiceRecording = async (endReason: "manual" | "auto") => {
    if (!sessionId || voiceStartedAtRef.current === null) {
      return;
    }

    if (voiceTimeoutRef.current) {
      clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = null;
    }

    setLoading(true);
    setIsRecording(false);
    setVoiceStatus(endReason === "auto" ? "Time limit reached" : "Recording stopped");

    const recording = recordingRef.current;
    recordingRef.current = null;
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
      setVoiceError("Recording stopped, but the audio file could not be finalized.");
    }

    const durationSec = Math.min(
      300,
      Math.max(1, Math.round((Date.now() - voiceStartedAtRef.current) / 1000)),
    );
    voiceStartedAtRef.current = null;

    try {
      const response = await submitVoiceTask({
        session_id: sessionId,
        picture_id: selectedPictureRef.current.id,
        duration_sec: durationSec,
        pause_count: 0,
        long_pause_count: 0,
        estimated_word_count: 0,
        transcript: "",
        audio_uri: audioUri,
        audio_blob: audioBlob,
        model_name: "Auralis/NatHACKS_Auralis",
      });
      setVoicePrediction(response);
      setDrawingSignal(response.voice_signal);
      setVoiceStatus("Prediction ready");
      startMemoryRecall();
    } catch (error) {
      setVoiceStatus("Backend not reachable");
      setVoiceError("Could not submit voice recording. You can use the demo voice sample to continue.");
    } finally {
      setLoading(false);
    }
  };

  const submitDrawing = async () => {
    if (!sessionId || strokes.length === 0) {
      Alert.alert("Draw the clock first", drawingTask.instruction);
      return;
    }
    if (validDrawingPointCount() < MIN_LOCAL_DRAWING_POINTS) {
      setDrawingError("Please draw the full clock before submitting.");
      Alert.alert("Keep drawing", "Please draw the full clock before submitting.");
      return;
    }
    setLoading(true);
    setDrawingSubmitState("submitting");
    setDrawingError("");
    try {
      const drawingPayload: DrawingScorePayload = {
        task_id: drawingTask.task_id,
        session_id: sessionId,
        instruction: drawingTask.instruction,
        canvas: {
          width: canvasDimensions.width,
          height: canvasDimensions.height,
        },
        strokes,
        metadata: {
          completion_time_ms: Math.max(1, Date.now() - drawingStartedAt),
          clear_count: clearCount,
          undo_count: undoCount,
          device: "mobile",
        },
      };
      logDrawingPayloadForDev(drawingPayload);
      const response = await postJson<DrawingScoreResult>("/task/drawing/score", drawingPayload);
      setDrawingScoreResult(response);
      setDrawingSubmitState("success");
      try {
        const summary = await postJson<ScoreSummary>("/score", { session_id: sessionId });
        setScoreSummary(summary);
      } catch (error) {
        setScoreSummary(null);
      }
      setScreen("results");
    } catch (error) {
      setDrawingSubmitState("error");
      setDrawingError("Could not score drawing. Please check that the API server is running.");
      Alert.alert("Could not score drawing", "Please check that the API server is running.");
    } finally {
      setLoading(false);
    }
  };

  const clearDrawing = () => {
    isDrawingRef.current = false;
    setStrokes([]);
    setClearCount((count) => count + 1);
    setDrawingStartedAt(Date.now());
    setDrawingScoreResult(null);
    setDrawingSubmitState("idle");
    setDrawingError("");
  };

  const toggleChecklist = (key: ChecklistKey) => {
    setChecklist((current) => ({ ...current, [key]: !current[key] }));
  };

  const renderDrawing = () =>
    strokes.flatMap((stroke, strokeIndex) =>
      stroke.points.slice(1).map((point, pointIndex) => (
        <LineSegment
          key={`${strokeIndex}-${pointIndex}`}
          start={stroke.points[pointIndex]}
          end={point}
        />
      )),
    );

  if (screen === "welcome") {
    return (
      <ScreenShell title="A 10-minute brain-health check" eyebrow="For older adults and caregivers">
        <Text style={styles.body}>
          Complete a caregiver checklist, a hawker memory game, a picture story demo, and a
          clock drawing task. The result is a GP-ready summary of domain-level risk signals.
        </Text>
        <PrimaryButton label="Start check" onPress={() => setScreen("consent")} />
      </ScreenShell>
    );
  }

  if (screen === "consent") {
    return (
      <ScreenShell title="Before you begin" eyebrow="Consent">
        <Text style={styles.body}>
          MindTrail SG does not provide a diagnosis. It helps identify possible thinking and
          planning signals that may be worth discussing with a GP or caregiver.
        </Text>
        <PrimaryButton label="I understand" onPress={() => setScreen("profile")} />
        <SecondaryButton label="Back" onPress={() => setScreen("welcome")} />
      </ScreenShell>
    );
  }

  if (screen === "profile") {
    return (
      <ScreenShell title="Basic profile" eyebrow="Step 1 of 6">
        <FieldLabel>Age band</FieldLabel>
        <View style={styles.segmentRow}>
          {["55-64", "65-74", "75+"].map((value) => (
            <Segment key={value} label={value} selected={ageBand === value} onPress={() => setAgeBand(value)} />
          ))}
        </View>
        <FieldLabel>Preferred language</FieldLabel>
        <TextInput value={language} onChangeText={setLanguage} style={styles.input} />
        <FieldLabel>Education band</FieldLabel>
        <View style={styles.segmentRow}>
          {["Primary", "Secondary", "Post-secondary"].map((value) => (
            <Segment
              key={value}
              label={value}
              selected={education === value}
              onPress={() => setEducation(value)}
            />
          ))}
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Caregiver helping today</Text>
          <Switch value={caregiverAssisted} onValueChange={setCaregiverAssisted} />
        </View>
        <PrimaryButton label={loading ? "Starting..." : "Continue"} onPress={startSession} disabled={loading} />
      </ScreenShell>
    );
  }

  if (screen === "checklist") {
    return (
      <ScreenShell title="Caregiver checklist" eyebrow="Step 2 of 6">
        <Text style={styles.body}>Mark anything that is new, worsening, or worrying recently.</Text>
        {checklistLabels.map((item) => (
          <View key={item.key} style={styles.switchRow}>
            <Text style={styles.switchLabel}>{item.label}</Text>
            <Switch value={checklist[item.key]} onValueChange={() => toggleChecklist(item.key)} />
          </View>
        ))}
        <FieldLabel>Mood or personality change</FieldLabel>
        <View style={styles.segmentRow}>
          {["no", "unsure", "yes"].map((value) => (
            <Segment
              key={value}
              label={value}
              selected={moodChange === value}
              onPress={() => setMoodChange(value)}
            />
          ))}
        </View>
        <PrimaryButton label={loading ? "Saving..." : "Continue"} onPress={saveChecklist} disabled={loading} />
      </ScreenShell>
    );
  }

  if (screen === "memoryIntro") {
    return (
      <ScreenShell title="Hawker Memory" eyebrow="Step 3 of 6">
        <Text style={styles.body}>
          Remember these hawker orders. After one short picture task, we will ask you to recall
          them.
        </Text>
        <View style={styles.signalCard}>
          <Text style={styles.pictureTitle}>Memory recall game</Text>
          <Text style={styles.signalReason}>
            Study the orders at a comfortable pace. The next task gives a short pause before the
            recall questions.
          </Text>
        </View>
        <PrimaryButton label="Show orders" onPress={startMemoryStudy} />
      </ScreenShell>
    );
  }

  if (screen === "memoryStudy") {
    return (
      <ScreenShell title="Remember these orders" eyebrow="Study time">
        <View style={styles.memoryTimerCard}>
          <Text style={styles.statusText}>Study time remaining</Text>
          <Text style={styles.memoryTimer}>{memoryCountdown}s</Text>
        </View>
        <View style={styles.memoryOrderList}>
          {memoryTask.studyItems.map((studyItem) => (
            <View key={`${studyItem.person}-${studyItem.item}`} style={styles.memoryOrderCard}>
              <FoodVisual
                emoji={studyItem.emoji}
                image={studyItem.image}
                label={studyItem.item}
                size={studyFoodVisualSize}
              />
              <View style={styles.memoryOrderText}>
                <Text style={styles.memoryFoodLabel}>{studyItem.item}</Text>
                <Text style={styles.memoryPersonLabel}>{studyItem.person}</Text>
              </View>
            </View>
          ))}
        </View>
        {memoryCountdown === 0 ? (
          <Text style={styles.memoryReadyText}>Great. We will ask about the orders shortly.</Text>
        ) : null}
        <PrimaryButton
          disabled={memoryCountdown > 0}
          label={memoryCountdown > 0 ? "Study the orders" : "Continue to picture story"}
          onPress={() => setScreen("voice")}
        />
      </ScreenShell>
    );
  }

  if (screen === "voice") {
    return (
      <ScreenShell title="Picture story task" eyebrow="Step 4 of 6">
        <Image
          source={selectedPicture.image}
          style={styles.storyImage}
          resizeMode="cover"
          accessibilityLabel={selectedPicture.title}
        />
        <View style={styles.picturePrompt}>
          <Text style={styles.pictureTitle}>{selectedPicture.title}</Text>
          <Text style={styles.pictureText}>
            Tell us what is happening in this picture. Speak naturally for up to 5 minutes.
          </Text>
        </View>
        <View style={styles.voiceStatusRow}>
          <View>
            <Text style={styles.statusText}>Status</Text>
            <Text style={styles.signalReason}>{voiceStatus}</Text>
          </View>
          <View style={[styles.recordingDot, isRecording && styles.recordingDotLive]} />
        </View>
        <Text style={styles.body}>
          You can record a real response for Whisper/Auralis scoring, or continue with safe demo
          metadata if microphone access is not available. After this, we will ask about the hawker
          orders.
        </Text>
        {isRecording ? (
          <PrimaryButton
            label={loading ? "Submitting..." : "Stop and submit recording"}
            onPress={() => void stopVoiceRecording("manual")}
            disabled={loading}
          />
        ) : (
          <PrimaryButton
            label={loading ? "Starting..." : "Start voice recording"}
            onPress={startVoiceRecording}
            disabled={loading}
          />
        )}
        <SecondaryButton label="Use demo voice sample" onPress={submitVoiceDemo} />
        {voicePrediction ? (
          <View style={styles.signalCard}>
            <View style={styles.signalHeader}>
              <Text style={styles.signalDomain}>Language</Text>
              <Text
                style={[
                  styles.bandPill,
                  {
                    color: bandColor(voicePrediction.voice_signal.band),
                    borderColor: bandColor(voicePrediction.voice_signal.band),
                  },
                ]}
              >
                {bandLabel(voicePrediction.voice_signal.band)}
              </Text>
            </View>
            <Text style={styles.signalReason}>{voicePrediction.voice_signal.reason}</Text>
            {voicePrediction.prediction.transcription?.text ? (
              <Text style={styles.metaText}>
                Transcript: {voicePrediction.prediction.transcription.text}
              </Text>
            ) : null}
          </View>
        ) : null}
        {voiceError ? <Text style={styles.errorText}>{voiceError}</Text> : null}
      </ScreenShell>
    );
  }

  if (screen === "memoryRecall") {
    if (!currentMemoryQuestion) {
      return (
        <ScreenShell title="Hawker Memory" eyebrow="Needs retry">
          <Text style={styles.body}>The recall question could not be loaded.</Text>
          <PrimaryButton label="Restart memory game" onPress={() => setScreen("memoryIntro")} />
        </ScreenShell>
      );
    }
    const memoryOptionsAreFood = currentMemoryQuestion.options.every((option) =>
      getHawkerFoodVisual(option),
    );

    return (
      <ScreenShell title="Now let's recall the hawker orders" eyebrow={`Question ${memoryProgressText}`}>
        <Text style={styles.body}>Choose the answer you remember best.</Text>
        <Text style={styles.memoryQuestion}>{currentMemoryQuestion.prompt}</Text>
        {currentMemoryQuestion.foodLabel ? (
          <View style={styles.memoryPromptCard}>
            <FoodVisual
              emoji={currentMemoryQuestion.foodEmoji ?? "Food"}
              image={currentMemoryQuestion.foodImage}
              label={currentMemoryQuestion.foodLabel}
              size={studyFoodVisualSize}
            />
            <Text style={styles.memoryFoodLabel}>{currentMemoryQuestion.foodLabel}</Text>
          </View>
        ) : null}
        <View style={[styles.memoryOptionList, memoryOptionsAreFood && styles.memoryTileGrid]}>
          {currentMemoryQuestion.options.map((option) => (
            <MemoryAnswerOption
              key={option}
              label={option}
              onPress={() => selectMemoryAnswer(currentMemoryQuestion, option)}
            />
          ))}
        </View>
      </ScreenShell>
    );
  }

  if (screen === "drawing") {
    return (
      <ScreenShell title={drawingTask.instruction} eyebrow="Step 5 of 6">
        <View style={styles.canvasWrap}>
          <View
            style={styles.canvas}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setCanvasDimensions({ width, height });
            }}
            {...panResponder.panHandlers}
          >
            <View pointerEvents="none" style={styles.canvasGuide} />
            {renderDrawing()}
          </View>
        </View>
        <View style={styles.taskStats}>
          <Text style={styles.statText}>Strokes: {strokes.length}</Text>
          <Text style={styles.statText}>Points: {validDrawingPointCount()}</Text>
          <Text style={styles.statText}>Clears: {clearCount}</Text>
        </View>
        {drawingSubmitState === "submitting" ? <Text style={styles.metaText}>Scoring drawing...</Text> : null}
        {drawingSubmitState === "success" ? <Text style={styles.successText}>Drawing scored.</Text> : null}
        {drawingError ? <Text style={styles.errorText}>{drawingError}</Text> : null}
        <PrimaryButton label={loading ? "Scoring..." : "Submit clock drawing"} onPress={submitDrawing} disabled={loading} />
        <SecondaryButton label="Clear and retry" onPress={clearDrawing} />
      </ScreenShell>
    );
  }

  if (screen === "results") {
    const signals = scoreSummary ? Object.values(scoreSummary.domain_signals) : drawingSignal ? [drawingSignal] : [];
    return (
      <ScreenShell title="Results" eyebrow="Step 6 of 6">
        {loading ? <ActivityIndicator /> : null}
        {scoreSummary ? (
          <View style={[styles.overallBand, { borderColor: bandColor(scoreSummary.overall_band) }]}>
            <Text style={[styles.overallText, { color: bandColor(scoreSummary.overall_band) }]}>
              Overall: {bandLabel(scoreSummary.overall_band)}
            </Text>
          </View>
        ) : null}
        {memoryResult ? <MemoryResultCard result={memoryResult} /> : null}
        {drawingScoreResult ? <DrawingResultCard result={drawingScoreResult} /> : null}
        {signals.map((signal) => (
          <View key={signal.domain} style={styles.signalCard}>
            <View style={styles.signalHeader}>
              <Text style={styles.signalDomain}>{signal.domain.replace(/_/g, " ")}</Text>
              <Text style={[styles.bandPill, { color: bandColor(signal.band), borderColor: bandColor(signal.band) }]}>
                {bandLabel(signal.band)}
              </Text>
            </View>
            <Text style={styles.signalReason}>{signal.reason}</Text>
          </View>
        ))}
        {!drawingScoreResult && signals.length === 0 ? (
          <Text style={styles.body}>Drawing result is not available yet. Return to the drawing task and try again.</Text>
        ) : null}
        <PrimaryButton label="View report summary" onPress={() => setScreen("report")} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="GP-ready report summary" eyebrow="Report">
      {memoryResult ? <MemoryResultCard result={memoryResult} /> : null}
      {drawingScoreResult ? <DrawingResultCard result={drawingScoreResult} /> : null}
      {scoreSummary ? (
        <>
          <Text style={styles.body}>Session: {scoreSummary.session_id}</Text>
          {scoreSummary.recommendations.map((item) => (
            <Text key={item} style={styles.recommendation}>
              {item}
            </Text>
          ))}
          <Text style={styles.metaText}>HTML report endpoint: {API_BASE_URL}/report/{scoreSummary.session_id}</Text>
        </>
      ) : !drawingScoreResult ? (
        <Text style={styles.body}>Complete the memory and clock drawing tasks to generate a report summary.</Text>
      ) : (
        <Text style={styles.body}>Memory and clock drawing summaries are ready. Caregiver and GP report details can be added after the remaining tasks are scored.</Text>
      )}
      <PrimaryButton label="Start another check" onPress={() => setScreen("welcome")} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    alignItems: "stretch",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f7f7f2",
  },
  header: {
    marginBottom: 22,
  },
  brand: {
    marginBottom: 8,
    color: "#0f766e",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0,
  },
  eyebrow: {
    marginBottom: 8,
    color: "#57534e",
>>>>>>> c193df38f1cf164552ec385b30665e07a18b9f45
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
<<<<<<< HEAD
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
=======
    color: "#111827",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 36,
  },
  body: {
    marginBottom: 18,
    color: "#374151",
    fontSize: 16,
    lineHeight: 24,
  },
  disclaimer: {
    marginTop: 22,
>>>>>>> c193df38f1cf164552ec385b30665e07a18b9f45
    color: "#4b5563",
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#9ca3af",
    borderRadius: 8,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: "#1f2937",
    fontSize: 16,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.55,
  },
  pressedButton: {
    opacity: 0.88,
  },
  fieldLabel: {
    marginTop: 14,
    marginBottom: 8,
    color: "#1f2937",
    fontSize: 14,
    fontWeight: "800",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    color: "#111827",
    fontSize: 16,
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segment: {
    minHeight: 42,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
  },
  segmentSelected: {
    borderColor: "#0f766e",
    backgroundColor: "#ccfbf1",
  },
  segmentText: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "700",
  },
  segmentTextSelected: {
    color: "#115e59",
  },
  switchRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  switchLabel: {
    flex: 1,
    color: "#1f2937",
    fontSize: 15,
    lineHeight: 21,
<<<<<<< HEAD
=======
  },
  picturePrompt: {
    minHeight: 120,
    justifyContent: "center",
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 18,
  },
  pictureTitle: {
    marginBottom: 10,
    color: "#0f766e",
    fontSize: 16,
    fontWeight: "800",
  },
  pictureText: {
    color: "#292524",
    fontSize: 18,
    lineHeight: 27,
  },
  storyImage: {
    width: "100%",
    height: 210,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: "#d6d3d1",
  },
  voiceStatusRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 14,
  },
  recordingDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#9ca3af",
  },
  recordingDotLive: {
    backgroundColor: "#b91c1c",
  },
  memoryTimerCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 14,
  },
  memoryTimer: {
    color: "#0f766e",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0,
  },
  memoryOrderList: {
    gap: 12,
    marginBottom: 14,
  },
  memoryOrderCard: {
    minHeight: 144,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 12,
  },
  memoryOrderText: {
    flex: 1,
  },
  memoryReadyText: {
    marginBottom: 2,
    color: "#0f766e",
    fontSize: 15,
    lineHeight: 21,
  },
  memoryFoodLabel: {
    flex: 1,
    color: "#111827",
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 27,
  },
  memoryPersonLabel: {
    marginTop: 4,
    color: "#57534e",
    fontSize: 15,
    letterSpacing: 0,
  },
  memoryQuestion: {
    marginBottom: 18,
    color: "#111827",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 32,
  },
  memoryPromptCard: {
    minHeight: 144,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 12,
  },
  memoryOptionList: {
    gap: 12,
  },
  memoryTileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  memoryOption: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 12,
  },
  memoryFoodTile: {
    minHeight: 178,
    flexDirection: "column",
    alignItems: "center",
    paddingVertical: 14,
  },
  memoryFoodTileWide: {
    flexBasis: "47%",
    flexGrow: 1,
    maxWidth: "49%",
  },
  memoryFoodTileCompact: {
    flexBasis: "100%",
    maxWidth: "100%",
  },
  memoryOptionPressed: {
    borderColor: "#0f766e",
    backgroundColor: "#ccfbf1",
  },
  memoryOptionText: {
    flex: 1,
    color: "#111827",
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 25,
  },
  memoryFoodTileText: {
    flex: 0,
    alignSelf: "stretch",
    textAlign: "center",
>>>>>>> c193df38f1cf164552ec385b30665e07a18b9f45
  },
  foodVisual: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 8,
    backgroundColor: "#f5f5f4",
  },
  foodVisualMedium: {
    width: 112,
    height: 112,
  },
  foodVisualLarge: {
    width: 128,
    height: 128,
  },
  foodImage: {
    width: "100%",
    height: "100%",
  },
  foodEmoji: {
    fontSize: 36,
    letterSpacing: 0,
  },
  foodEmojiMedium: {
    fontSize: 54,
  },
  foodEmojiLarge: {
    fontSize: 64,
  },
  personOptionIcon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#e0f2fe",
  },
  personOptionInitial: {
    color: "#075985",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0,
  },
  canvasWrap: {
    alignItems: "center",
    marginBottom: 14,
  },
  canvas: {
    width: 320,
    height: 320,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#111827",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  canvasGuide: {
    position: "absolute",
    left: 28,
    top: 28,
    width: 264,
    height: 264,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 132,
  },
  strokeLine: {
    position: "absolute",
    height: 4,
    borderRadius: 2,
    backgroundColor: "#111827",
  },
  taskStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  statText: {
    color: "#4b5563",
    fontSize: 14,
    fontWeight: "700",
  },
  overallBand: {
    marginBottom: 14,
    borderWidth: 2,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 14,
  },
  overallText: {
    fontSize: 18,
    fontWeight: "800",
  },
  signalCard: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 14,
  },
  signalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  signalDomain: {
    flex: 1,
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  bandPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "800",
  },
  signalReason: {
    color: "#374151",
    fontSize: 14,
    lineHeight: 20,
  },
  statusText: {
    marginBottom: 8,
    color: "#1f2937",
    fontSize: 13,
    fontWeight: "800",
  },
  metaText: {
    marginTop: 8,
    color: "#57534e",
    fontSize: 13,
    lineHeight: 19,
  },
  successText: {
    marginBottom: 8,
    color: "#047857",
    fontSize: 14,
    fontWeight: "700",
  },
  errorText: {
    marginBottom: 8,
    color: "#b91c1c",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  recommendation: {
    marginBottom: 10,
    color: "#1f2937",
    fontSize: 15,
    lineHeight: 22,
  },
});
