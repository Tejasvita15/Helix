import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Text style={styles.eyebrow}>MindTrail SG</Text>
      <Text style={styles.title}>Brain-health check scaffold</Text>
      <Text style={styles.body}>
        This starter app will support possible cognitive-risk signal workflows
        for caregivers and GP follow-up.
      </Text>
      <Text style={styles.disclaimer}>
        This is not a diagnosis. Please discuss new or worsening concerns with
        a healthcare professional.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f8fafc",
  },
  eyebrow: {
    marginBottom: 12,
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0,
  },
  title: {
    marginBottom: 16,
    color: "#111827",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0,
    textAlign: "center",
  },
  body: {
    maxWidth: 360,
    marginBottom: 16,
    color: "#374151",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  disclaimer: {
    maxWidth: 360,
    color: "#4b5563",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
});
