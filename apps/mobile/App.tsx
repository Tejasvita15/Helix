import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  GestureResponderEvent,
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

type Role = "patient" | "caregiver";
type ShellTone = Role | "neutral";

type Screen =
  | "welcome"
  | "role"
  | "profile"
  | "link"
  | "consent"
  | "patientHome"
  | "dailyCheckIn"
  | "patientCompletion"
  | "patientJourney"
  | "caregiverReport"
  | "checklist"
  | "voice"
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

const MOCK_LINK_CODE = "482913";

const DEFAULT_DRAWING_TASK: DrawingTaskPrompt = {
  task_id: "clock_drawing",
  instruction: "Draw a clock shown by the prompt.",
};
const MIN_LOCAL_DRAWING_POINTS = 20;

const colors = {
  primary: "#0F766E",
  primaryDark: "#115E59",
  primarySoft: "#ECFDF5",
  caregiver: "#2563EB",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  textMain: "#111827",
  textSecondary: "#374151",
  textMuted: "#64748B",
  border: "#E5E7EB",
  success: "#15803D",
  successSoft: "#DCFCE7",
  warning: "#B45309",
  warningSoft: "#FEF3C7",
  danger: "#B91C1C",
  dangerSoft: "#FEE2E2",
};

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

const journeyItems = [
  {
    label: "Today",
    title: "Morning check-in",
    detail: "Mood was steady. Sleep was marked as fair. Cognitive activities continue in the existing task flow.",
  },
  {
    label: "Yesterday",
    title: "Caregiver note",
    detail: "No urgent concern added. Repeat questions marked as something to watch.",
  },
  {
    label: "Last week",
    title: "Clock drawing",
    detail: "Completed once. Summary stayed in the monitoring range for follow-up context.",
  },
];

function bandColor(band: Band) {
  if (band === "red") {
    return colors.danger;
  }
  if (band === "amber") {
    return colors.warning;
  }
  return colors.success;
}

function bandSoftColor(band: Band) {
  if (band === "red") {
    return colors.dangerSoft;
  }
  if (band === "amber") {
    return colors.warningSoft;
  }
  return colors.successSoft;
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
    return colors.warning;
  }
  if (signalBand === "medium_signal") {
    return colors.primary;
  }
  if (signalBand === "low_signal") {
    return colors.success;
  }
  return colors.textMuted;
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
  tone = "patient",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: ShellTone;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        tone === "caregiver" && styles.primaryButtonCaregiver,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
  tone = "patient",
}: {
  label: string;
  onPress: () => void;
  tone?: ShellTone;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        tone === "caregiver" && styles.secondaryButtonCaregiver,
        pressed && styles.pressedButton,
      ]}
    >
      <Text style={[styles.secondaryButtonText, tone === "caregiver" && styles.secondaryButtonTextCaregiver]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ScreenShell({
  title,
  eyebrow,
  children,
  onBack,
  tone = "neutral",
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onBack?: () => void;
  tone?: ShellTone;
}) {
  return (
    <ScrollView
      contentContainerStyle={[
        styles.screen,
        tone === "patient" && styles.patientScreen,
        tone === "caregiver" && styles.caregiverScreen,
      ]}
    >
      <StatusBar style="dark" />
      <View style={styles.shellInner}>
        <View style={styles.topLine}>
          <Text style={[styles.brand, tone === "caregiver" && styles.brandCaregiver]}>MindTrail</Text>
          {onBack ? (
            <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
              <Text style={[styles.backButtonText, tone === "caregiver" && styles.backButtonTextCaregiver]}>
                Back
              </Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.header}>
          {eyebrow ? <Text style={[styles.eyebrow, tone === "caregiver" && styles.eyebrowCaregiver]}>{eyebrow}</Text> : null}
          <Text style={[styles.title, tone === "caregiver" && styles.caregiverTitle]}>{title}</Text>
        </View>
        {children}
        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      </View>
    </ScrollView>
  );
}

function Segment({
  label,
  selected,
  onPress,
  tone = "patient",
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  tone?: ShellTone;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.segment,
        selected && styles.segmentSelected,
        tone === "caregiver" && selected && styles.segmentSelectedCaregiver,
        pressed && styles.pressedButton,
      ]}
    >
      <Text
        style={[
          styles.segmentText,
          selected && styles.segmentTextSelected,
          tone === "caregiver" && selected && styles.segmentTextSelectedCaregiver,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function InfoCard({
  title,
  body,
  children,
  accent = "patient",
}: {
  title: string;
  body?: string;
  children?: ReactNode;
  accent?: ShellTone;
}) {
  return (
    <View style={[styles.infoCard, accent === "caregiver" && styles.infoCardCaregiver]}>
      <Text style={styles.infoCardTitle}>{title}</Text>
      {body ? <Text style={styles.infoCardBody}>{body}</Text> : null}
      {children}
    </View>
  );
}

function ActionCard({
  title,
  label,
  body,
  action,
  onPress,
  disabled,
  tone = "patient",
}: {
  title: string;
  label: string;
  body: string;
  action: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: ShellTone;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        tone === "caregiver" && styles.actionCardCaregiver,
        disabled && styles.actionCardDisabled,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      <Text style={[styles.actionLabel, tone === "caregiver" && styles.actionLabelCaregiver]}>{label}</Text>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionBody}>{body}</Text>
      <Text style={[styles.actionText, tone === "caregiver" && styles.actionTextCaregiver]}>{action}</Text>
    </Pressable>
  );
}

function MetricCard({
  label,
  value,
  detail,
  band,
}: {
  label: string;
  value: string;
  detail: string;
  band?: Band;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, band && { color: bandColor(band) }]}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function Pill({ label, band }: { label: string; band?: Band }) {
  return (
    <Text
      style={[
        styles.pill,
        band
          ? {
              backgroundColor: bandSoftColor(band),
              color: bandColor(band),
              borderColor: bandColor(band),
            }
          : null,
      ]}
    >
      {label}
    </Text>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
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

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [drawingTask, setDrawingTask] = useState<DrawingTaskPrompt>(DEFAULT_DRAWING_TASK);
  const [patientName, setPatientName] = useState("Mei Ling");
  const [caregiverName, setCaregiverName] = useState("Daniel");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [patientDisplayName, setPatientDisplayName] = useState("Mei Ling");
  const [relationship, setRelationship] = useState("Family");
  const [linkCode, setLinkCode] = useState("");
  const [linkComplete, setLinkComplete] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [ageBand, setAgeBand] = useState("65-74");
  const [language, setLanguage] = useState("English");
  const [education, setEducation] = useState("Secondary");
  const [caregiverAssisted, setCaregiverAssisted] = useState(true);
  const [dailyFeeling, setDailyFeeling] = useState("Steady");
  const [dailySleep, setDailySleep] = useState("Fair");
  const [dailyActivities, setDailyActivities] = useState("Usual");
  const [checkInComplete, setCheckInComplete] = useState(false);
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
  const [drawingSignal] = useState<Signal | null>(null);
  const [scoreSummary] = useState<ScoreSummary | null>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    if (screen === "drawing") {
      setDrawingStartedAt(Date.now());
      setDrawingSubmitState("idle");
      setDrawingError("");
    }
  }, [screen]);

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
      setScreen("voice");
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
      setScreen("drawing");
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

  const chooseRole = (nextRole: Role) => {
    setRole(nextRole);
    setConsentAccepted(false);
    setLinkComplete(false);
    if (nextRole === "patient") {
      setPatientDisplayName(patientName);
    }
    setScreen("profile");
  };

  const continueFromProfile = () => {
    if (role === "patient") {
      setPatientDisplayName(patientName || "Mei Ling");
    }
    setScreen("link");
  };

  const completeLinking = () => {
    setLinkComplete(true);
    setScreen("consent");
  };

  const completeConsent = () => {
    setConsentAccepted(true);
    setScreen(role === "caregiver" ? "patientJourney" : "patientHome");
  };

  const completeDailyCheckIn = () => {
    setCheckInComplete(true);
    startSession();
  };

  const resetToWelcome = () => {
    setScreen("welcome");
    setRole(null);
  };

  const activeTone: ShellTone = role ?? "neutral";
  const reportBand: Band = drawingScoreResult?.signal_band === "higher_signal" ? "amber" : "green";

  if (screen === "welcome") {
    return (
      <ScreenShell title="MindTrail" eyebrow="Calm daily brain-health check">
        <Text style={styles.leadText}>
          A simple check-in for older adults and caregivers. MindTrail shares risk signals for follow-up, not a diagnosis.
        </Text>
        <View style={styles.heroPanel}>
          <Text style={styles.heroNumber}>10</Text>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>minutes or less</Text>
            <Text style={styles.heroBody}>Check in, play a short task, and keep a caregiver-ready summary.</Text>
          </View>
        </View>
        <PrimaryButton label="Get started" onPress={() => setScreen("role")} />
      </ScreenShell>
    );
  }

  if (screen === "role") {
    return (
      <ScreenShell title="Who is using MindTrail today?" eyebrow="Choose role" onBack={() => setScreen("welcome")}>
        <View style={styles.choiceStack}>
          <ActionCard
            title="Patient"
            label="For my own check-in"
            body="Large steps, calm prompts, and one guided cognitive activity flow."
            action="Continue as patient"
            onPress={() => chooseRole("patient")}
          />
          <ActionCard
            title="Caregiver"
            label="For supporting someone"
            body="See today's summary, journey notes, and report-ready context."
            action="Continue as caregiver"
            tone="caregiver"
            onPress={() => chooseRole("caregiver")}
          />
        </View>
      </ScreenShell>
    );
  }

  if (screen === "profile") {
    const isCaregiver = role === "caregiver";
    return (
      <ScreenShell
        title="Login and profile"
        eyebrow={isCaregiver ? "Caregiver setup" : "Patient setup"}
        tone={activeTone}
        onBack={() => setScreen("role")}
      >
        <InfoCard
          title="Demo login"
          body="Use these details for the MVP. No real patient data is needed."
          accent={activeTone}
        />
        <FieldLabel>{isCaregiver ? "Your name" : "Your name"}</FieldLabel>
        <TextInput
          value={isCaregiver ? caregiverName : patientName}
          onChangeText={isCaregiver ? setCaregiverName : setPatientName}
          style={styles.input}
          placeholder={isCaregiver ? "Caregiver name" : "Patient name"}
        />
        <FieldLabel>Phone or email</FieldLabel>
        <TextInput
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          style={styles.input}
          placeholder="Optional for demo"
          keyboardType="default"
        />
        {isCaregiver ? (
          <>
            <FieldLabel>Patient name</FieldLabel>
            <TextInput
              value={patientDisplayName}
              onChangeText={setPatientDisplayName}
              style={styles.input}
              placeholder="Patient name"
            />
            <FieldLabel>Relationship</FieldLabel>
            <View style={styles.segmentRow}>
              {["Family", "Friend", "Helper"].map((value) => (
                <Segment
                  key={value}
                  label={value}
                  selected={relationship === value}
                  onPress={() => setRelationship(value)}
                  tone="caregiver"
                />
              ))}
            </View>
          </>
        ) : (
          <>
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
          </>
        )}
        <PrimaryButton label="Continue" tone={activeTone} onPress={continueFromProfile} />
      </ScreenShell>
    );
  }

  if (screen === "link") {
    const isCaregiver = role === "caregiver";
    const sanitizedCode = linkCode.replace(/\D/g, "").slice(0, 6);
    return (
      <ScreenShell
        title={isCaregiver ? "Link to patient" : "Share your link code"}
        eyebrow="6-digit linking"
        tone={activeTone}
        onBack={() => setScreen("profile")}
      >
        {isCaregiver ? (
          <>
            <Text style={styles.body}>
              Enter the 6-digit code from {patientDisplayName || "the patient"} to connect this demo.
            </Text>
            <TextInput
              value={sanitizedCode}
              onChangeText={(value) => setLinkCode(value.replace(/\D/g, "").slice(0, 6))}
              style={[styles.input, styles.codeInput]}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="482913"
            />
            <Text style={styles.helperText}>Demo code: {MOCK_LINK_CODE}</Text>
            <PrimaryButton
              label="Link patient"
              tone="caregiver"
              onPress={completeLinking}
              disabled={sanitizedCode.length !== 6}
            />
          </>
        ) : (
          <>
            <Text style={styles.body}>
              Ask your caregiver to enter this code on their phone. You can continue after sharing it.
            </Text>
            <View style={styles.codeCard}>
              <Text style={styles.codeText}>{MOCK_LINK_CODE}</Text>
              <Text style={styles.codeHelper}>Caregiver-patient link code</Text>
            </View>
            <PrimaryButton label="I shared the code" onPress={completeLinking} />
          </>
        )}
      </ScreenShell>
    );
  }

  if (screen === "consent") {
    return (
      <ScreenShell title="Before you begin" eyebrow="Consent" tone={activeTone} onBack={() => setScreen("link")}>
        <InfoCard
          title="What MindTrail does"
          body="MindTrail helps organize check-ins and task summaries so new or worsening concerns can be discussed with a healthcare professional."
          accent={activeTone}
        />
        <View style={styles.consentBox}>
          <Text style={styles.body}>
            I understand MindTrail does not diagnose dementia or any medical condition.
          </Text>
          <View style={styles.switchRowNoBorder}>
            <Text style={styles.switchLabel}>I agree to continue with this demo</Text>
            <Switch value={consentAccepted} onValueChange={setConsentAccepted} />
          </View>
        </View>
        <PrimaryButton
          label="Continue"
          tone={activeTone}
          onPress={completeConsent}
          disabled={!consentAccepted}
        />
      </ScreenShell>
    );
  }

  if (screen === "patientHome") {
    return (
      <ScreenShell title={`Good morning, ${patientName || "there"}`} eyebrow="Patient home" tone="patient">
        <View style={styles.statusRow}>
          <Pill label={linkComplete ? "Linked" : "Not linked"} />
          <Pill label={checkInComplete ? "Check-in started" : "Check-in pending"} band={checkInComplete ? "green" : "amber"} />
        </View>
        <InfoCard
          title="Today's gentle plan"
          body="Start with a quick daily check-in, then continue into the existing MindTrail cognitive activity flow."
        />
        <ActionCard
          title="Daily check-in"
          label="2 minutes"
          body="Share how you feel today. When you finish, MindTrail continues directly into the existing activity flow."
          action="Start check-in"
          onPress={() => setScreen("dailyCheckIn")}
        />
        <SecondaryButton label="Switch role" onPress={resetToWelcome} />
      </ScreenShell>
    );
  }

  if (screen === "dailyCheckIn") {
    return (
      <ScreenShell title="Daily check-in" eyebrow="Patient" tone="patient" onBack={() => setScreen("patientHome")}>
        <Text style={styles.leadText}>Let's check how you are feeling today.</Text>
        <FieldLabel>How are you feeling?</FieldLabel>
        <View style={styles.segmentRow}>
          {["Good", "Steady", "Low"].map((value) => (
            <Segment key={value} label={value} selected={dailyFeeling === value} onPress={() => setDailyFeeling(value)} />
          ))}
        </View>
        <FieldLabel>How was your sleep?</FieldLabel>
        <View style={styles.segmentRow}>
          {["Rested", "Fair", "Poor"].map((value) => (
            <Segment key={value} label={value} selected={dailySleep === value} onPress={() => setDailySleep(value)} />
          ))}
        </View>
        <FieldLabel>Any change in usual activities?</FieldLabel>
        <View style={styles.segmentRow}>
          {["Usual", "Some change", "Unsure"].map((value) => (
            <Segment
              key={value}
              label={value}
              selected={dailyActivities === value}
              onPress={() => setDailyActivities(value)}
            />
          ))}
        </View>
        <InfoCard title="Today's answers">
          <SummaryRow label="Feeling" value={dailyFeeling} />
          <SummaryRow label="Sleep" value={dailySleep} />
          <SummaryRow label="Activities" value={dailyActivities} />
        </InfoCard>
        <PrimaryButton
          label={loading ? "Starting..." : "Continue to activities"}
          onPress={completeDailyCheckIn}
          disabled={loading}
        />
      </ScreenShell>
    );
  }

  if (screen === "patientJourney") {
    return (
      <ScreenShell title={`${patientDisplayName || "Patient"}'s journey`} eyebrow="Caregiver" tone="caregiver" onBack={() => setScreen("consent")}>
        <View style={styles.timeline}>
          {journeyItems.map((item) => (
            <View key={`${item.label}-${item.title}`} style={styles.timelineItem}>
              <Text style={styles.timelineLabel}>{item.label}</Text>
              <View style={styles.timelineCard}>
                <Text style={styles.timelineTitle}>{item.title}</Text>
                <Text style={styles.timelineBody}>{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>
        <PrimaryButton label="View today's summary" tone="caregiver" onPress={() => setScreen("caregiverReport")} />
        <SecondaryButton label="Switch role" tone="caregiver" onPress={resetToWelcome} />
      </ScreenShell>
    );
  }

  if (screen === "caregiverReport") {
    return (
      <ScreenShell title="Report summary" eyebrow="Caregiver" tone="caregiver" onBack={() => setScreen("patientJourney")}>
        <View style={styles.metricGrid}>
          <MetricCard
            label="Daily check-in"
            value={checkInComplete ? "Complete" : "Waiting"}
            detail={checkInComplete ? `${dailyFeeling}, sleep ${dailySleep.toLowerCase()}` : "No patient check-in submitted yet"}
            band={checkInComplete ? "green" : "amber"}
          />
          <MetricCard
            label="Cognitive activities"
            value={drawingScoreResult ? "Clock done" : "Not yet"}
            detail={drawingScoreResult ? drawingStatusLabel(drawingScoreResult) : "Waiting for the patient activity flow"}
            band={drawingScoreResult ? reportBand : "amber"}
          />
        </View>
        <InfoCard title="GP-ready note" accent="caregiver">
          <Text style={styles.reportText}>
            {patientDisplayName || "The patient"} has a calm daily summary available. Current information is for follow-up discussion only and should be interpreted with a healthcare professional.
          </Text>
          {drawingScoreResult ? <DrawingResultCard result={drawingScoreResult} /> : null}
          <SummaryRow label="Linked caregiver" value={caregiverName || "Caregiver"} />
          <SummaryRow label="Relationship" value={relationship} />
          <SummaryRow label="Session" value={sessionId ?? `demo-${MOCK_LINK_CODE}`} />
        </InfoCard>
      </ScreenShell>
    );
  }

  if (screen === "checklist") {
    return (
      <ScreenShell title="Check-in observations" eyebrow="Activity flow" tone="patient" onBack={() => setScreen("dailyCheckIn")}>
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

  if (screen === "voice") {
    return (
      <ScreenShell title="Picture story task" eyebrow="Activity flow" tone="patient" onBack={() => setScreen("checklist")}>
        <View style={styles.picturePrompt}>
          <Text style={styles.pictureTitle}>Picture prompt</Text>
          <Text style={styles.pictureText}>
            A family is preparing a meal while one person looks for something on the table.
          </Text>
        </View>
        <Text style={styles.body}>
          Tell us what is happening in this picture. For this MVP demo, the app sends safe mock speech metadata instead of storing an audio recording.
        </Text>
        <PrimaryButton
          label={loading ? "Saving..." : "Use demo voice sample"}
          onPress={submitVoiceDemo}
          disabled={loading}
        />
      </ScreenShell>
    );
  }

  if (screen === "drawing") {
    return (
      <ScreenShell title={drawingTask.instruction} eyebrow="Activity flow" tone="patient" onBack={() => setScreen("voice")}>
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
      <ScreenShell title="Task results" eyebrow="Summary" tone="patient" onBack={() => setScreen("drawing")}>
        {loading ? <ActivityIndicator /> : null}
        {scoreSummary ? (
          <View style={[styles.overallBand, { borderColor: bandColor(scoreSummary.overall_band) }]}>
            <Text style={[styles.overallText, { color: bandColor(scoreSummary.overall_band) }]}>
              Overall: {bandLabel(scoreSummary.overall_band)}
            </Text>
          </View>
        ) : null}
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

  if (screen === "report") {
    return (
    <ScreenShell title="Report summary" eyebrow="GP-ready" tone={activeTone} onBack={() => setScreen("results")}>
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
        <Text style={styles.body}>Complete the clock drawing task to generate a report summary.</Text>
      ) : (
        <Text style={styles.body}>
          Clock drawing summary is ready. Caregiver and GP report details can be added after the remaining tasks are scored.
        </Text>
      )}
      <InfoCard title="Check-in context">
        <SummaryRow label="Feeling" value={dailyFeeling} />
        <SummaryRow label="Sleep" value={dailySleep} />
        <SummaryRow label="Activities" value={dailyActivities} />
      </InfoCard>
      <PrimaryButton label="Complete check-in" onPress={() => setScreen("patientCompletion")} />
    </ScreenShell>
    );
  }

  if (screen === "patientCompletion") {
    return (
      <ScreenShell title="All done for today" eyebrow="Completion" tone="patient">
        <InfoCard
          title="Summary saved"
          body="Your check-in and activity results are ready for the report summary. Your caregiver can review the journey view."
        >
          <SummaryRow label="Feeling" value={dailyFeeling} />
          <SummaryRow label="Sleep" value={dailySleep} />
          <SummaryRow label="Activities" value={dailyActivities} />
        </InfoCard>
        <PrimaryButton label="Back to patient home" onPress={() => setScreen("patientHome")} />
        <SecondaryButton label="Switch role" onPress={resetToWelcome} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="MindTrail" eyebrow="Calm daily brain-health check">
      <Text style={styles.body}>Return to the welcome screen to start again.</Text>
      <PrimaryButton label="Back to welcome" onPress={resetToWelcome} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  patientScreen: {
    backgroundColor: "#F5FFFB",
  },
  caregiverScreen: {
    backgroundColor: "#F8FAFC",
  },
  shellInner: {
    width: "100%",
    maxWidth: 760,
  },
  topLine: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 16,
  },
  brand: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0,
  },
  brandCaregiver: {
    color: colors.caregiver,
  },
  backButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "800",
  },
  backButtonTextCaregiver: {
    color: colors.caregiver,
  },
  header: {
    marginBottom: 22,
  },
  eyebrow: {
    marginBottom: 8,
    color: colors.primaryDark,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0,
  },
  eyebrowCaregiver: {
    color: colors.caregiver,
  },
  title: {
    color: colors.textMain,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 40,
  },
  caregiverTitle: {
    fontSize: 30,
    lineHeight: 38,
  },
  leadText: {
    marginBottom: 20,
    color: colors.textSecondary,
    fontSize: 20,
    lineHeight: 30,
  },
  body: {
    marginBottom: 18,
    color: colors.textSecondary,
    fontSize: 18,
    lineHeight: 28,
  },
  helperText: {
    marginTop: 8,
    marginBottom: 8,
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  disclaimer: {
    marginTop: 24,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  heroPanel: {
    minHeight: 136,
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.surface,
    padding: 24,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 2,
  },
  heroNumber: {
    color: colors.primary,
    fontSize: 56,
    fontWeight: "800",
    lineHeight: 64,
  },
  heroCopy: {
    flex: 1,
  },
  heroTitle: {
    color: colors.textMain,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 30,
  },
  heroBody: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 17,
    lineHeight: 25,
  },
  choiceStack: {
    gap: 14,
  },
  dashboardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  primaryButton: {
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  primaryButtonCaregiver: {
    backgroundColor: colors.caregiver,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 28,
    textAlign: "center",
  },
  secondaryButton: {
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 18,
    backgroundColor: colors.surface,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  secondaryButtonCaregiver: {
    borderColor: colors.caregiver,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 27,
    textAlign: "center",
  },
  secondaryButtonTextCaregiver: {
    color: colors.caregiver,
  },
  disabledButton: {
    opacity: 0.55,
  },
  pressedButton: {
    opacity: 0.86,
  },
  fieldLabel: {
    marginTop: 16,
    marginBottom: 8,
    color: colors.textMain,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 24,
  },
  input: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 18,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    color: colors.textMain,
    fontSize: 18,
  },
  codeInput: {
    minHeight: 72,
    textAlign: "center",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0,
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  segment: {
    minHeight: 54,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 18,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  segmentSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  segmentSelectedCaregiver: {
    borderColor: colors.caregiver,
    backgroundColor: "#EFF6FF",
  },
  segmentText: {
    color: colors.textSecondary,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 24,
  },
  segmentTextSelected: {
    color: colors.primaryDark,
  },
  segmentTextSelectedCaregiver: {
    color: colors.caregiver,
  },
  switchRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  switchRowNoBorder: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  switchLabel: {
    flex: 1,
    color: colors.textMain,
    fontSize: 18,
    lineHeight: 26,
  },
  infoCard: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.surface,
    padding: 24,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 2,
  },
  infoCardCaregiver: {
    borderColor: "#DBEAFE",
  },
  infoCardTitle: {
    marginBottom: 8,
    color: colors.textMain,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 30,
  },
  infoCardBody: {
    color: colors.textSecondary,
    fontSize: 18,
    lineHeight: 28,
  },
  actionCard: {
    flexGrow: 1,
    flexBasis: 260,
    minHeight: 178,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.surface,
    padding: 24,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 2,
  },
  actionCardCaregiver: {
    borderColor: "#DBEAFE",
  },
  actionCardDisabled: {
    opacity: 0.62,
  },
  actionLabel: {
    marginBottom: 8,
    color: colors.primary,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 22,
  },
  actionLabelCaregiver: {
    color: colors.caregiver,
  },
  actionTitle: {
    color: colors.textMain,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 32,
  },
  actionBody: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 17,
    lineHeight: 25,
  },
  actionText: {
    marginTop: 18,
    color: colors.primary,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 26,
  },
  actionTextCaregiver: {
    color: colors.caregiver,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  pill: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    color: colors.primaryDark,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  codeCard: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 156,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.surface,
    padding: 24,
  },
  codeText: {
    color: colors.primary,
    fontSize: 48,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 58,
  },
  codeHelper: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  consentBox: {
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.surface,
    padding: 22,
  },
  summaryRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 10,
  },
  summaryLabel: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 23,
  },
  summaryValue: {
    flex: 1,
    color: colors.textMain,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 24,
    textAlign: "right",
  },
  timeline: {
    gap: 14,
    marginBottom: 14,
  },
  timelineItem: {
    gap: 8,
  },
  timelineLabel: {
    color: colors.caregiver,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 22,
  },
  timelineCard: {
    borderWidth: 1,
    borderColor: "#DBEAFE",
    borderRadius: 24,
    backgroundColor: colors.surface,
    padding: 22,
  },
  timelineTitle: {
    color: colors.textMain,
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 29,
  },
  timelineBody: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 17,
    lineHeight: 25,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 14,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.surface,
    padding: 22,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21,
  },
  metricValue: {
    marginTop: 8,
    color: colors.textMain,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 34,
  },
  metricDetail: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
  reportText: {
    marginBottom: 16,
    color: colors.textSecondary,
    fontSize: 17,
    lineHeight: 26,
  },
  picturePrompt: {
    minHeight: 190,
    justifyContent: "center",
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.surface,
    padding: 24,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 2,
  },
  pictureTitle: {
    marginBottom: 10,
    color: colors.primary,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 26,
  },
  pictureText: {
    color: colors.textMain,
    fontSize: 22,
    lineHeight: 32,
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
    borderColor: colors.textMain,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  canvasGuide: {
    position: "absolute",
    left: 28,
    top: 28,
    width: 264,
    height: 264,
    borderWidth: 1,
    borderColor: "#D6D3D1",
    borderRadius: 132,
  },
  strokeLine: {
    position: "absolute",
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMain,
  },
  taskStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  statText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 22,
  },
  overallBand: {
    marginBottom: 14,
    borderWidth: 2,
    borderRadius: 18,
    backgroundColor: colors.surface,
    padding: 16,
  },
  overallText: {
    fontSize: 18,
    fontWeight: "800",
  },
  signalCard: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.surface,
    padding: 20,
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
    color: colors.textMain,
    fontSize: 18,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  bandPill: {
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 13,
    fontWeight: "800",
  },
  signalReason: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
  statusText: {
    marginBottom: 8,
    color: colors.textMain,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 22,
  },
  metaText: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  successText: {
    marginBottom: 8,
    color: colors.success,
    fontSize: 15,
    fontWeight: "800",
  },
  errorText: {
    marginBottom: 8,
    color: colors.danger,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 22,
  },
  recommendation: {
    marginBottom: 10,
    color: colors.textMain,
    fontSize: 16,
    lineHeight: 24,
  },
});
