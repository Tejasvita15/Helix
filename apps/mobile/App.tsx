import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
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
};

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
const MEMORY_STUDY_SECONDS = 25;

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

  return (
    <View
      style={[
        styles.strokeLine,
        {
          left: start.x,
          top: start.y - 2,
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
  size?: "small" | "large";
}) {
  const isLarge = size === "large";

  return (
    <View
      accessibilityLabel={`${label} image`}
      style={[styles.foodVisual, isLarge && styles.foodVisualLarge]}
    >
      {image ? (
        <Image
          resizeMode="cover"
          source={image}
          style={styles.foodImage}
        />
      ) : (
        <Text style={[styles.foodEmoji, isLarge && styles.foodEmojiLarge]}>{emoji}</Text>
      )}
    </View>
  );
}

function MemoryAnswerOption({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const foodVisual = getHawkerFoodVisual(label);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.memoryOption,
        pressed && styles.memoryOptionPressed,
      ]}
    >
      {foodVisual ? (
        <FoodVisual
          emoji={foodVisual.emoji}
          image={foodVisual.image}
          label={foodVisual.label}
        />
      ) : (
        <View style={styles.personOptionIcon}>
          <Text style={styles.personOptionInitial}>{label.charAt(0)}</Text>
        </View>
      )}
      <Text style={styles.memoryOptionText}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
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
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [clearCount, setClearCount] = useState(0);
  const [undoCount] = useState(0);
  const [drawingStartedAt, setDrawingStartedAt] = useState(Date.now());
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 320, height: 320 });
  const [drawingScoreResult, setDrawingScoreResult] = useState<DrawingScoreResult | null>(null);
  const [drawingSubmitState, setDrawingSubmitState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [drawingError, setDrawingError] = useState("");
  const [drawingSignal, setDrawingSignal] = useState<Signal | null>(null);
  const [modelSource, setModelSource] = useState("");
  const [scoreSummary, setScoreSummary] = useState<ScoreSummary | null>(null);
  const [memoryTask, setMemoryTask] = useState<HawkerMemoryTask>(() =>
    createHawkerMemoryTask("demo-session-001"),
  );
  const [memoryCountdown, setMemoryCountdown] = useState(MEMORY_STUDY_SECONDS);
  const [memoryAnswers, setMemoryAnswers] = useState<HawkerMemoryAnswer[]>([]);
  const [memoryQuestionIndex, setMemoryQuestionIndex] = useState(0);
  const [memoryQuestionStartedAt, setMemoryQuestionStartedAt] = useState<number | null>(null);
  const [memoryStartedAt, setMemoryStartedAt] = useState<string | null>(null);
  const [memoryCompletedAt, setMemoryCompletedAt] = useState<string | null>(null);
  const [memoryResult, setMemoryResult] = useState<HawkerMemoryResult | null>(null);
  const canvasSize = 320;
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
    if (screen !== "memoryStudy" || memoryCountdown <= 0) {
      return undefined;
    }

    const timer = setInterval(() => {
      setMemoryCountdown((seconds) => Math.max(seconds - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [memoryCountdown, screen]);

  const elapsedDrawingSeconds = () =>
    Math.max(1, Math.round((Date.now() - drawingStartedAt) / 1000));

  const startStroke = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    if (!isPointInsideCanvas(locationX, locationY)) {
      return;
    }
    const t = Date.now() - drawingStartedAt;
    setStrokes((current) => [...current, { points: [{ x: locationX, y: locationY, t }] }]);
  };

  const addPoint = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    if (!isPointInsideCanvas(locationX, locationY)) {
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
      }),
    [drawingStartedAt, canvasDimensions.height, canvasDimensions.width],
  );

  const validDrawingPointCount = () => strokes.reduce((total, stroke) => total + stroke.points.length, 0);

  const isPointInsideCanvas = (x: number, y: number) =>
    x >= 0 && y >= 0 && x <= canvasDimensions.width && y <= canvasDimensions.height;

  const resetMemoryTask = (seed: string) => {
    setMemoryTask(createHawkerMemoryTask(seed));
    setMemoryCountdown(MEMORY_STUDY_SECONDS);
    setMemoryAnswers([]);
    setMemoryQuestionIndex(0);
    setMemoryQuestionStartedAt(null);
    setMemoryStartedAt(null);
    setMemoryCompletedAt(null);
    setMemoryResult(null);
  };

  const startMemoryStudy = () => {
    setMemoryCountdown(MEMORY_STUDY_SECONDS);
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

  const finishMemoryScoring = (nextAnswers: HawkerMemoryAnswer[]) => {
    setMemoryCompletedAt(new Date().toISOString());
    setMemoryResult(scoreHawkerMemoryTask(memoryTask.questions, nextAnswers));
    setScreen("drawing");
  };

  const selectMemoryAnswer = (
    question: HawkerMemoryQuestion,
    selectedAnswer: string,
  ) => {
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
      finishMemoryScoring(nextAnswers);
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
      await postJson("/task/voice", {
        session_id: sessionId,
        duration_sec: 40,
        pause_count: 4,
        long_pause_count: 1,
        estimated_word_count: 68,
        transcript: "Demo picture story response captured as mock metadata for the MVP.",
      });
      startMemoryRecall();
    } catch (error) {
      Alert.alert("Could not save voice task", "Please check that the API server is running.");
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
          Complete a caregiver checklist, a picture story demo, and a clock drawing task. The
          result is a GP-ready summary of domain-level risk signals.
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
          Remember these hawker orders. You will be asked about them later.
        </Text>
        <View style={styles.signalCard}>
          <Text style={styles.pictureTitle}>Memory recall game</Text>
          <Text style={styles.signalReason}>
            Study the orders at a comfortable pace. A short picture story task
            comes next, then the recall questions.
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
            <View
              key={`${studyItem.person}-${studyItem.item}`}
              style={styles.memoryOrderCard}
            >
              <FoodVisual
                emoji={studyItem.emoji}
                image={studyItem.image}
                label={studyItem.item}
                size="large"
              />
              <View style={styles.memoryOrderText}>
                <Text style={styles.signalDomain}>{studyItem.person}</Text>
                <Text style={styles.memoryFoodLabel}>{studyItem.item}</Text>
              </View>
            </View>
          ))}
        </View>
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
        <View style={styles.picturePrompt}>
          <Text style={styles.pictureTitle}>Picture prompt</Text>
          <Text style={styles.pictureText}>
            A family is preparing a meal while one person looks for something on the table.
          </Text>
        </View>
        <Text style={styles.body}>
          Tell us what is happening in this picture. For this MVP demo, the app sends safe mock
          speech metadata instead of storing an audio recording. This also gives a short pause
          before the Hawker Memory recall.
        </Text>
        <PrimaryButton
          label={loading ? "Saving..." : "Use demo voice sample"}
          onPress={submitVoiceDemo}
          disabled={loading}
        />
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

    return (
      <ScreenShell title="Recall" eyebrow={`Question ${memoryProgressText}`}>
        <Text style={styles.memoryQuestion}>{currentMemoryQuestion.prompt}</Text>
        {currentMemoryQuestion.foodLabel ? (
          <View style={styles.memoryPromptCard}>
            <FoodVisual
              emoji={currentMemoryQuestion.foodEmoji ?? "🍽️"}
              image={currentMemoryQuestion.foodImage}
              label={currentMemoryQuestion.foodLabel}
              size="large"
            />
            <Text style={styles.memoryFoodLabel}>
              {currentMemoryQuestion.foodLabel}
            </Text>
          </View>
        ) : null}
        <View style={styles.memoryOptionList}>
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
            <View style={styles.canvasGuide} />
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
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0,
  },
  title: {
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
  },
  picturePrompt: {
    minHeight: 180,
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
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 14,
  },
  memoryOrderText: {
    flex: 1,
  },
  memoryFoodLabel: {
    flex: 1,
    color: "#374151",
    fontSize: 19,
    fontWeight: "700",
    lineHeight: 26,
    letterSpacing: 0,
  },
  memoryQuestion: {
    marginBottom: 18,
    color: "#111827",
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 34,
    letterSpacing: 0,
  },
  memoryPromptCard: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 14,
  },
  memoryOptionList: {
    gap: 12,
  },
  memoryOption: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 14,
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
    lineHeight: 26,
    letterSpacing: 0,
  },
  foodVisual: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 8,
    backgroundColor: "#f7f7f2",
  },
  foodVisualLarge: {
    width: 76,
    height: 76,
  },
  foodImage: {
    width: "100%",
    height: "100%",
  },
  foodEmoji: {
    fontSize: 28,
    letterSpacing: 0,
  },
  foodEmojiLarge: {
    fontSize: 40,
  },
  personOptionIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#ccfbf1",
  },
  personOptionInitial: {
    color: "#115e59",
    fontSize: 20,
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
