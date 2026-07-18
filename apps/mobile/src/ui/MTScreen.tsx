import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { MindTrailLogo } from "./MindTrailLogo";
import { MTStepHeader } from "./MTStepHeader";
import { TrailMotif } from "./TrailMotif";
import { mtColors, mtRadii, mtShadows, mtSpacing } from "./theme";

export type MTScreenProps = {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  currentStep?: number;
  totalSteps?: number;
  footer?: ReactNode;
  showLogo?: boolean;
  showTrail?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  shellStyle?: StyleProp<ViewStyle>;
};

export function MTScreen({
  children,
  title,
  eyebrow,
  subtitle,
  currentStep,
  totalSteps,
  footer,
  showLogo = true,
  showTrail = true,
  contentStyle,
  shellStyle,
}: MTScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.shell, shellStyle]}>
          {showTrail ? <TrailMotif style={styles.trailMotif} /> : null}
          {showLogo ? <MindTrailLogo compact style={styles.logo} /> : null}
          {title ? (
            <MTStepHeader
              currentStep={currentStep}
              eyebrow={eyebrow}
              subtitle={subtitle}
              title={title}
              totalSteps={totalSteps}
            />
          ) : null}
          <View style={styles.body}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mtColors.mtBg,
  },
  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: mtSpacing.lg,
    backgroundColor: mtColors.mtBg,
  },
  shell: {
    width: "100%",
    maxWidth: 760,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(139, 111, 71, 0.16)",
    borderRadius: mtRadii.screen,
    backgroundColor: "rgba(255, 251, 244, 0.9)",
    padding: mtSpacing.xl,
    ...mtShadows.screen,
  },
  trailMotif: {
    position: "absolute",
    right: mtSpacing.lg,
    top: mtSpacing.md,
    opacity: 0.5,
  },
  logo: {
    marginBottom: mtSpacing.xl,
  },
  body: {
    alignSelf: "stretch",
    marginTop: mtSpacing.xl,
  },
  footer: {
    alignSelf: "stretch",
    marginTop: mtSpacing.xl,
  },
});
