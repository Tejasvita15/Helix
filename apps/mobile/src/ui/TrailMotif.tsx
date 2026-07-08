import { StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { mtColors } from "./theme";

export type TrailMotifProps = {
  style?: StyleProp<ViewStyle>;
};

export function TrailMotif({ style }: TrailMotifProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.container, style]}
    >
      <View style={[styles.node, styles.nodeStart]} />
      <View style={[styles.segment, styles.segmentOne]} />
      <View style={[styles.node, styles.nodeMiddle]} />
      <View style={[styles.segment, styles.segmentTwo]} />
      <View style={[styles.node, styles.nodeEnd]} />
      <View style={[styles.softPatch, styles.softPatchOne]} />
      <View style={[styles.softPatch, styles.softPatchTwo]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 148,
    height: 76,
  },
  node: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: mtColors.mtAccent,
  },
  nodeStart: {
    left: 8,
    top: 48,
  },
  nodeMiddle: {
    left: 68,
    top: 14,
    backgroundColor: mtColors.mtPrimary,
  },
  nodeEnd: {
    right: 8,
    top: 42,
    backgroundColor: mtColors.mtLavenderDark,
  },
  segment: {
    position: "absolute",
    height: 3,
    borderRadius: 3,
    backgroundColor: mtColors.mtAccent,
  },
  segmentOne: {
    left: 19,
    top: 44,
    width: 58,
    transform: [{ rotate: "-27deg" }],
  },
  segmentTwo: {
    left: 78,
    top: 32,
    width: 56,
    backgroundColor: mtColors.mtPrimary,
    transform: [{ rotate: "24deg" }],
  },
  softPatch: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.54,
  },
  softPatchOne: {
    left: 36,
    top: 8,
    width: 22,
    height: 22,
    backgroundColor: mtColors.mtAccentSoft,
  },
  softPatchTwo: {
    right: 30,
    bottom: 2,
    width: 24,
    height: 24,
    backgroundColor: mtColors.mtSage,
  },
});
