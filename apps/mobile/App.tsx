import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
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

type Screen =
  | "welcome"
  | "consent"
  | "profile"
  | "checklist"
  | "voice"
  | "drawing"
  | "results"
  | "report";

type Band = "green" | "amber" | "red";

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

type ChecklistKey =
  | "repeated_questions"
  | "missed_medication"
  | "missed_appointments"
  | "getting_lost"
  | "money_or_bills_difficulty"
  | "family_concerned";

const DISCLAIMER =
  "This is not a diagnosis. Please discuss new or worsening concerns with a healthcare professional.";

function getApiBaseUrl() {
  if (Platform.OS === "web") {
    return "http://127.0.0.1:8000";
  }

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

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ageBand, setAgeBand] = useState("65-74");
  const [language, setLanguage] = useState("English");
  const [education, setEducation] = useState("Secondary");
  const [caregiverAssisted, setCaregiverAssisted] = useState(true);
  const [checklist, setChecklist] = useState(initialChecklist);
  const [moodChange, setMoodChange] = useState("unsure");
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [clearCount, setClearCount] = useState(0);
  const [drawingStartedAt, setDrawingStartedAt] = useState(Date.now());
  const [drawingSignal, setDrawingSignal] = useState<Signal | null>(null);
  const [modelSource, setModelSource] = useState("");
  const [scoreSummary, setScoreSummary] = useState<ScoreSummary | null>(null);
  const canvasSize = 320;

  useEffect(() => {
    if (screen === "drawing") {
      setDrawingStartedAt(Date.now());
    }
  }, [screen]);

  const elapsedDrawingSeconds = () =>
    Math.max(1, Math.round((Date.now() - drawingStartedAt) / 1000));

  const startStroke = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    const t = (Date.now() - drawingStartedAt) / 1000;
    setStrokes((current) => [...current, [{ x: locationX, y: locationY, t }]]);
  };

  const addPoint = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    if (locationX < 0 || locationY < 0 || locationX > canvasSize || locationY > canvasSize) {
      return;
    }
    const t = (Date.now() - drawingStartedAt) / 1000;
    setStrokes((current) => {
      if (current.length === 0) {
        return [[{ x: locationX, y: locationY, t }]];
      }
      const next = [...current];
      const lastStroke = next[next.length - 1];
      const lastPoint = lastStroke[lastStroke.length - 1];
      if (lastPoint && Math.abs(lastPoint.x - locationX) + Math.abs(lastPoint.y - locationY) < 2) {
        return current;
      }
      next[next.length - 1] = [...lastStroke, { x: locationX, y: locationY, t }];
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
    [drawingStartedAt],
  );

  const startSession = async () => {
    setLoading(true);
    try {
      const response = await postJson<{ session_id: string }>("/session/start", {
        age_band: ageBand,
        preferred_language: language,
        education_band: education,
        caregiver_assisted: caregiverAssisted,
      });
      setSessionId(response.session_id);
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
      Alert.alert("Draw the clock first", "Please draw a clock showing 10 past 11.");
      return;
    }
    setLoading(true);
    try {
      const response = await postJson<{
        drawing_signal: Signal;
        model_source: string;
      }>("/task/drawing", {
        session_id: sessionId,
        task_type: "clock_draw",
        completion_time_sec: elapsedDrawingSeconds(),
        clear_count: clearCount,
        canvas_width: canvasSize,
        canvas_height: canvasSize,
        strokes,
      });
      setDrawingSignal(response.drawing_signal);
      setModelSource(response.model_source);
      const score = await postJson<ScoreSummary>("/score", { session_id: sessionId });
      setScoreSummary(score);
      setScreen("results");
    } catch (error) {
      Alert.alert("Could not score drawing", "Please check that the API server is running.");
    } finally {
      setLoading(false);
    }
  };

  const clearDrawing = () => {
    setStrokes([]);
    setClearCount((count) => count + 1);
    setDrawingStartedAt(Date.now());
  };

  const toggleChecklist = (key: ChecklistKey) => {
    setChecklist((current) => ({ ...current, [key]: !current[key] }));
  };

  const renderDrawing = () =>
    strokes.flatMap((stroke, strokeIndex) =>
      stroke.slice(1).map((point, pointIndex) => (
        <LineSegment
          key={`${strokeIndex}-${pointIndex}`}
          start={stroke[pointIndex]}
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
          MindTrail SG does not diagnose dementia. It helps identify possible cognitive-risk
          signals that may be worth discussing with a GP or caregiver.
        </Text>
        <PrimaryButton label="I understand" onPress={() => setScreen("profile")} />
        <SecondaryButton label="Back" onPress={() => setScreen("welcome")} />
      </ScreenShell>
    );
  }

  if (screen === "profile") {
    return (
      <ScreenShell title="Basic profile" eyebrow="Step 1 of 5">
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
      <ScreenShell title="Caregiver checklist" eyebrow="Step 2 of 5">
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
      <ScreenShell title="Picture story task" eyebrow="Step 3 of 5">
        <View style={styles.picturePrompt}>
          <Text style={styles.pictureTitle}>Picture prompt</Text>
          <Text style={styles.pictureText}>
            A family is preparing a meal while one person looks for something on the table.
          </Text>
        </View>
        <Text style={styles.body}>
          Tell us what is happening in this picture. For this MVP demo, the app sends safe mock
          speech metadata instead of storing an audio recording.
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
      <ScreenShell title="Draw a clock showing 10 past 11" eyebrow="Step 4 of 5">
        <View style={styles.canvasWrap}>
          <View style={styles.canvas} {...panResponder.panHandlers}>
            <View style={styles.canvasGuide} />
            {renderDrawing()}
          </View>
        </View>
        <View style={styles.taskStats}>
          <Text style={styles.statText}>Strokes: {strokes.length}</Text>
          <Text style={styles.statText}>Clears: {clearCount}</Text>
        </View>
        <PrimaryButton label={loading ? "Scoring..." : "Submit clock drawing"} onPress={submitDrawing} disabled={loading} />
        <SecondaryButton label="Clear and retry" onPress={clearDrawing} />
      </ScreenShell>
    );
  }

  if (screen === "results") {
    const signals = scoreSummary ? Object.values(scoreSummary.domain_signals) : drawingSignal ? [drawingSignal] : [];
    return (
      <ScreenShell title="Results" eyebrow="Step 5 of 5">
        {loading ? <ActivityIndicator /> : null}
        {scoreSummary ? (
          <View style={[styles.overallBand, { borderColor: bandColor(scoreSummary.overall_band) }]}>
            <Text style={[styles.overallText, { color: bandColor(scoreSummary.overall_band) }]}>
              Overall: {bandLabel(scoreSummary.overall_band)}
            </Text>
          </View>
        ) : null}
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
        {modelSource ? <Text style={styles.metaText}>Clock model source: {modelSource}</Text> : null}
        <PrimaryButton label="View report summary" onPress={() => setScreen("report")} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="GP-ready report summary" eyebrow="Report">
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
      ) : (
        <Text style={styles.body}>No score is available yet.</Text>
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
  metaText: {
    marginTop: 8,
    color: "#57534e",
    fontSize: 13,
    lineHeight: 19,
  },
  recommendation: {
    marginBottom: 10,
    color: "#1f2937",
    fontSize: 15,
    lineHeight: 22,
  },
});
