import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { mtColors, mtFontWeight, mtRadii, mtSpacing } from "./theme";

export type JourneyPathProps = {
  currentStep: number;
  totalSteps: number;
  labels?: string[];
  style?: StyleProp<ViewStyle>;
};

export function JourneyPath({ currentStep, totalSteps, labels, style }: JourneyPathProps) {
  const safeTotal = Math.max(1, Math.floor(totalSteps));
  const safeCurrent = Math.min(Math.max(1, Math.floor(currentStep)), safeTotal);
  const steps = Array.from({ length: safeTotal }, (_, index) => index + 1);
  const showLabels = Boolean(labels?.length);

  return (
    <View
      accessibilityLabel={`Step ${safeCurrent} of ${safeTotal}`}
      accessibilityValue={{ min: 1, max: safeTotal, now: safeCurrent }}
      accessible
      style={[styles.container, style]}
    >
      <View style={styles.markerRow}>
        {steps.map((step) => {
          const isComplete = step < safeCurrent;
          const isActive = step === safeCurrent;

          return (
            <Fragment key={step}>
              <View
                style={[
                  styles.marker,
                  isComplete && styles.markerComplete,
                  isActive && styles.markerActive,
                ]}
              >
                <Text
                  style={[
                    styles.markerText,
                    (isComplete || isActive) && styles.markerTextActive,
                  ]}
                >
                  {step}
                </Text>
              </View>
              {step < safeTotal ? (
                <View style={[styles.line, isComplete && styles.lineComplete]} />
              ) : null}
            </Fragment>
          );
        })}
      </View>
      {showLabels ? (
        <View style={styles.labelRow}>
          {steps.map((step) => (
            <Text key={step} numberOfLines={2} style={styles.stepLabel}>
              {labels?.[step - 1] ?? ""}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
  },
  markerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  marker: {
    width: 34,
    height: 34,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: mtColors.mtBorder,
    borderRadius: mtRadii.pill,
    backgroundColor: mtColors.mtSurface,
  },
  markerComplete: {
    borderColor: mtColors.mtSageDark,
    backgroundColor: mtColors.mtSage,
  },
  markerActive: {
    borderColor: mtColors.mtPrimary,
    backgroundColor: mtColors.mtPrimarySoft,
  },
  markerText: {
    color: mtColors.mtMuted,
    fontSize: 14,
    fontWeight: mtFontWeight.extraBold,
    lineHeight: 18,
  },
  markerTextActive: {
    color: mtColors.mtPrimaryDark,
  },
  line: {
    height: 2,
    minWidth: mtSpacing.lg,
    flex: 1,
    backgroundColor: mtColors.mtBorder,
  },
  lineComplete: {
    backgroundColor: mtColors.mtSageDark,
  },
  labelRow: {
    flexDirection: "row",
    marginTop: mtSpacing.xs,
  },
  stepLabel: {
    flex: 1,
    color: mtColors.mtMuted,
    fontSize: 12,
    fontWeight: mtFontWeight.semibold,
    lineHeight: 16,
    textAlign: "center",
  },
});
