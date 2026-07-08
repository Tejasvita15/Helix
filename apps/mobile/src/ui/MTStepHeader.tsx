import { StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import { JourneyPath } from "./JourneyPath";
import { mtColors, mtSpacing, mtType } from "./theme";

export type MTStepHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  currentStep?: number;
  totalSteps?: number;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function MTStepHeader({
  eyebrow,
  title,
  subtitle,
  currentStep,
  totalSteps,
  action,
  style,
}: MTStepHeaderProps) {
  const showJourney = typeof currentStep === "number" && typeof totalSteps === "number";

  return (
    <View style={[styles.container, style]}>
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {showJourney ? (
        <JourneyPath currentStep={currentStep} totalSteps={totalSteps} style={styles.path} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  titleCopy: {
    minWidth: 0,
    flex: 1,
  },
  eyebrow: {
    ...mtType.eyebrow,
    marginBottom: mtSpacing.xs,
    textTransform: "uppercase",
  },
  title: {
    ...mtType.screenTitle,
  },
  subtitle: {
    ...mtType.body,
    color: mtColors.mtMuted,
    marginTop: mtSpacing.sm,
  },
  action: {
    flexShrink: 0,
    marginLeft: mtSpacing.md,
  },
  path: {
    marginTop: mtSpacing.lg,
  },
});
