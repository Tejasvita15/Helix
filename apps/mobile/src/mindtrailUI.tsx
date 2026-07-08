import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from "react-native";

export const mtColors = {
  ink: "#172033",
  muted: "#667085",
  bg: "#F7F3EA",
  surface: "#FFFFFF",
  surfaceSoft: "#FFFBF4",
  primary: "#315C63",
  primaryDark: "#23464C",
  primarySoft: "#DDECEE",
  accent: "#8B6F47",
  accentSoft: "#EFE3D0",
  lavender: "#DCD7F8",
  lavenderDark: "#6254A8",
  sage: "#DCE8D5",
  sageDark: "#4F6F52",
  warning: "#B7791F",
  warningSoft: "#FFF3CD",
  danger: "#B42318",
  dangerSoft: "#FEE4E2",
  success: "#2F7D5C",
  successSoft: "#DDF3E8",
  border: "#E6DED1",
};

type Tone = "neutral" | "primary" | "accent" | "sage" | "lavender";
type BadgeTone = "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "lavender" | "sage";

export function MindTrailLogo() {
  return (
    <View style={ui.logoRow}>
      <View style={ui.logoMark}>
        <View style={ui.logoDot} />
        <View style={ui.logoTrail} />
      </View>
      <Text style={ui.logoText}>MindTrail</Text>
    </View>
  );
}

export function TrailMotif() {
  return (
    <View pointerEvents="none" style={ui.trailMotif}>
      <View style={[ui.trailNode, ui.trailNodeStart]} />
      <View style={[ui.trailSegment, ui.trailSegmentOne]} />
      <View style={[ui.trailNode, ui.trailNodeMiddle]} />
      <View style={[ui.trailSegment, ui.trailSegmentTwo]} />
      <View style={[ui.trailNode, ui.trailNodeEnd]} />
    </View>
  );
}

export function JourneyPath({ current, total }: { current: number; total: number }) {
  const steps = Array.from({ length: total }, (_, index) => index + 1);
  return (
    <View accessibilityLabel={`Step ${current} of ${total}`} style={ui.journeyPath}>
      {steps.map((step) => (
        <View key={step} style={ui.journeyStepWrap}>
          <View
            style={[
              ui.journeyStep,
              step < current && ui.journeyStepDone,
              step === current && ui.journeyStepActive,
            ]}
          >
            <Text
              style={[
                ui.journeyStepText,
                step <= current && ui.journeyStepTextActive,
              ]}
            >
              {step}
            </Text>
          </View>
          {step < total ? <View style={[ui.journeyLine, step < current && ui.journeyLineDone]} /> : null}
        </View>
      ))}
    </View>
  );
}

function parseStepText(eyebrow?: string) {
  const match = eyebrow?.match(/(?:Step|Question)\s+(\d+)\s+of\s+(\d+)/i);
  if (!match) {
    return null;
  }
  return {
    current: Number(match[1]),
    total: Number(match[2]),
  };
}

export function MTStepHeader({ eyebrow, title }: { eyebrow?: string; title: string }) {
  const step = parseStepText(eyebrow);
  return (
    <View style={ui.header}>
      {eyebrow ? <Text style={ui.eyebrow}>{eyebrow}</Text> : null}
      <Text style={ui.title}>{title}</Text>
      {step ? <JourneyPath current={step.current} total={step.total} /> : null}
    </View>
  );
}

export function MTScreen({
  title,
  eyebrow,
  children,
  footer,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <ScrollView contentContainerStyle={ui.screen}>
      <StatusBar style="dark" />
      <View style={ui.shell}>
        <TrailMotif />
        <MindTrailLogo />
        <MTStepHeader eyebrow={eyebrow} title={title} />
        {children}
        {footer ? <View style={ui.footer}>{footer}</View> : null}
      </View>
    </ScrollView>
  );
}

export function MTCard({
  children,
  tone = "neutral",
  style,
}: {
  children: ReactNode;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[ui.card, toneStyles[tone], style]}>{children}</View>;
}

export function MTButton({
  label,
  onPress,
  disabled,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        ui.button,
        isPrimary ? ui.primaryButton : ui.secondaryButton,
        disabled && ui.disabled,
        pressed && !disabled && ui.pressed,
      ]}
    >
      <Text style={[ui.buttonText, isPrimary ? ui.primaryButtonText : ui.secondaryButtonText]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function MTBadge({
  label,
  tone = "neutral",
  style,
  textStyle,
}: {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[ui.badge, badgeStyles[tone], style]}>
      <Text style={[ui.badgeText, badgeTextStyles[tone], textStyle]}>{label}</Text>
    </View>
  );
}

export function MTTextInput(props: TextInputProps) {
  return <TextInput {...props} style={[ui.input, props.style]} />;
}

const toneStyles: Record<Tone, ViewStyle> = {
  neutral: {},
  primary: {
    borderColor: mtColors.primarySoft,
    backgroundColor: mtColors.surfaceSoft,
  },
  accent: {
    borderColor: mtColors.accentSoft,
    backgroundColor: mtColors.surfaceSoft,
  },
  sage: {
    borderColor: mtColors.sage,
    backgroundColor: "#FAFCF8",
  },
  lavender: {
    borderColor: mtColors.lavender,
    backgroundColor: "#FBFAFF",
  },
};

const badgeStyles: Record<BadgeTone, ViewStyle> = {
  neutral: {
    borderColor: mtColors.border,
    backgroundColor: mtColors.surfaceSoft,
  },
  primary: {
    borderColor: mtColors.primary,
    backgroundColor: mtColors.primarySoft,
  },
  accent: {
    borderColor: mtColors.accent,
    backgroundColor: mtColors.accentSoft,
  },
  success: {
    borderColor: mtColors.success,
    backgroundColor: mtColors.successSoft,
  },
  warning: {
    borderColor: mtColors.warning,
    backgroundColor: mtColors.warningSoft,
  },
  danger: {
    borderColor: mtColors.danger,
    backgroundColor: mtColors.dangerSoft,
  },
  lavender: {
    borderColor: mtColors.lavenderDark,
    backgroundColor: mtColors.lavender,
  },
  sage: {
    borderColor: mtColors.sageDark,
    backgroundColor: mtColors.sage,
  },
};

const badgeTextStyles: Record<BadgeTone, TextStyle> = {
  neutral: { color: mtColors.muted },
  primary: { color: mtColors.primaryDark },
  accent: { color: mtColors.accent },
  success: { color: mtColors.success },
  warning: { color: mtColors.warning },
  danger: { color: mtColors.danger },
  lavender: { color: mtColors.lavenderDark },
  sage: { color: mtColors.sageDark },
};

const ui = StyleSheet.create({
  screen: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: mtColors.bg,
  },
  shell: {
    width: "100%",
    maxWidth: 760,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(139, 111, 71, 0.16)",
    borderRadius: 28,
    backgroundColor: "rgba(255, 251, 244, 0.86)",
    padding: 22,
    shadowColor: "#6F5D43",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 3,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  logoMark: {
    width: 38,
    height: 38,
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: mtColors.primarySoft,
  },
  logoDot: {
    position: "absolute",
    left: 9,
    top: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: mtColors.primary,
  },
  logoTrail: {
    position: "absolute",
    left: 13,
    top: 17,
    width: 18,
    height: 10,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: mtColors.accent,
    borderBottomLeftRadius: 10,
    transform: [{ rotate: "-16deg" }],
  },
  logoText: {
    color: mtColors.ink,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0,
  },
  trailMotif: {
    position: "absolute",
    right: 22,
    top: 18,
    width: 116,
    height: 52,
    opacity: 0.52,
  },
  trailNode: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: mtColors.accent,
  },
  trailNodeStart: {
    left: 5,
    top: 31,
  },
  trailNodeMiddle: {
    left: 54,
    top: 9,
    backgroundColor: mtColors.primary,
  },
  trailNodeEnd: {
    right: 7,
    top: 27,
    backgroundColor: mtColors.lavenderDark,
  },
  trailSegment: {
    position: "absolute",
    height: 2,
    backgroundColor: mtColors.accent,
  },
  trailSegmentOne: {
    left: 14,
    top: 29,
    width: 47,
    transform: [{ rotate: "-23deg" }],
  },
  trailSegmentTwo: {
    left: 63,
    top: 22,
    width: 45,
    backgroundColor: mtColors.primary,
    transform: [{ rotate: "20deg" }],
  },
  header: {
    marginBottom: 22,
  },
  eyebrow: {
    marginBottom: 8,
    color: mtColors.accent,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0,
  },
  title: {
    color: mtColors.ink,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 40,
  },
  journeyPath: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
  },
  journeyStepWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  journeyStep: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: mtColors.border,
    borderRadius: 15,
    backgroundColor: mtColors.surface,
  },
  journeyStepDone: {
    borderColor: mtColors.sageDark,
    backgroundColor: mtColors.sage,
  },
  journeyStepActive: {
    borderColor: mtColors.primary,
    backgroundColor: mtColors.primarySoft,
  },
  journeyStepText: {
    color: mtColors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  journeyStepTextActive: {
    color: mtColors.primaryDark,
  },
  journeyLine: {
    width: 18,
    height: 2,
    backgroundColor: mtColors.border,
  },
  journeyLineDone: {
    backgroundColor: mtColors.sageDark,
  },
  footer: {
    marginTop: 22,
  },
  card: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: mtColors.border,
    borderRadius: 24,
    backgroundColor: mtColors.surface,
    padding: 20,
    shadowColor: "#6F5D43",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 2,
  },
  button: {
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryButton: {
    backgroundColor: mtColors.primary,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: mtColors.primary,
    backgroundColor: mtColors.surfaceSoft,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 25,
    textAlign: "center",
  },
  primaryButtonText: {
    color: mtColors.surface,
  },
  secondaryButtonText: {
    color: mtColors.primaryDark,
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.86,
  },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: mtColors.border,
    borderRadius: 18,
    backgroundColor: mtColors.surface,
    paddingHorizontal: 16,
    color: mtColors.ink,
    fontSize: 17,
  },
});
