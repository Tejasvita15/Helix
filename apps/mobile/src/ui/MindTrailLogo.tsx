import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { mtColors, mtFontWeight, mtSpacing } from "./theme";

export type MindTrailLogoProps = {
  compact?: boolean;
  markOnly?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function MindTrailLogo({ compact = false, markOnly = false, style }: MindTrailLogoProps) {
  return (
    <View accessibilityLabel="MindTrail" accessible style={[styles.row, compact && styles.compactRow, style]}>
      <View style={[styles.mark, compact && styles.compactMark]}>
        <View style={[styles.dot, compact && styles.compactDot]} />
        <View style={[styles.trail, compact && styles.compactTrail]} />
        <View style={[styles.endDot, compact && styles.compactEndDot]} />
      </View>
      {!markOnly ? (
        <View style={styles.wordmark}>
          <Text style={[styles.name, compact && styles.compactName]}>MindTrail</Text>
          {!compact ? <Text style={styles.tagline}>guided cognitive risk signals</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  compactRow: {
    alignSelf: "flex-start",
  },
  mark: {
    width: 46,
    height: 46,
    justifyContent: "center",
    borderRadius: 23,
    backgroundColor: mtColors.mtPrimarySoft,
  },
  compactMark: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  dot: {
    position: "absolute",
    left: 11,
    top: 11,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: mtColors.mtPrimary,
  },
  compactDot: {
    left: 9,
    top: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  trail: {
    position: "absolute",
    left: 16,
    top: 21,
    width: 21,
    height: 12,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: mtColors.mtAccent,
    borderBottomLeftRadius: 12,
    transform: [{ rotate: "-16deg" }],
  },
  compactTrail: {
    left: 13,
    top: 17,
    width: 18,
    height: 10,
  },
  endDot: {
    position: "absolute",
    right: 9,
    bottom: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: mtColors.mtLavenderDark,
  },
  compactEndDot: {
    right: 8,
    bottom: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  wordmark: {
    marginLeft: mtSpacing.sm,
  },
  name: {
    color: mtColors.mtInk,
    fontSize: 20,
    fontWeight: mtFontWeight.extraBold,
    letterSpacing: 0,
    lineHeight: 25,
  },
  compactName: {
    fontSize: 18,
    lineHeight: 23,
  },
  tagline: {
    color: mtColors.mtMuted,
    fontSize: 12,
    fontWeight: mtFontWeight.semibold,
    letterSpacing: 0,
    lineHeight: 16,
    marginTop: 1,
  },
});
