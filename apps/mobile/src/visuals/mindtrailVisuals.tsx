import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";

export const mindTrailPalette = {
  ivory: "#F8F1E7",
  ivorySoft: "#FFFCF6",
  surface: "#FFFFFF",
  teal: "#315C63",
  tealDeep: "#203F44",
  tealMist: "#DDECEE",
  sage: "#D7E4CE",
  sageDeep: "#586F4D",
  lavender: "#DED8F4",
  lavenderDeep: "#6254A8",
  brown: "#8B6F47",
  brownSoft: "#EEE2D0",
  ink: "#172033",
  muted: "#667085",
  border: "#E8DDCF",
};

const DISCLAIMER =
  "This is not a diagnosis. Please discuss new or worsening concerns with a healthcare professional.";

type LogoSize = "sm" | "md" | "lg";
type TrailTone = "teal" | "sage" | "lavender" | "brown";
type SignalTone = "low" | "watch" | "review" | "uncertain";

type LegendItem = {
  label: string;
  description?: string;
  tone: SignalTone;
};

const defaultLegendItems: LegendItem[] = [
  {
    label: "Lower signal",
    description: "Routine check-in",
    tone: "low",
  },
  {
    label: "Watch signal",
    description: "Discuss context",
    tone: "watch",
  },
  {
    label: "Needs review",
    description: "Plan follow-up",
    tone: "review",
  },
  {
    label: "Uncertain",
    description: "More information",
    tone: "uncertain",
  },
];

export function MindTrailLogo({
  showWordmark = true,
  size = "md",
  style,
}: {
  showWordmark?: boolean;
  size?: LogoSize;
  style?: StyleProp<ViewStyle>;
}) {
  const markStyle = logoMarkStyles[size];
  const textStyle = logoTextStyles[size];

  return (
    <View accessibilityLabel="MindTrail" style={[styles.logoRow, style]}>
      <View style={[styles.logoMark, markStyle.mark]}>
        <View style={[styles.logoGlow, markStyle.glow]} />
        <View style={[styles.logoDot, markStyle.dot]} />
        <View style={[styles.logoTrailOne, markStyle.trailOne]} />
        <View style={[styles.logoTrailTwo, markStyle.trailTwo]} />
      </View>
      {showWordmark ? <Text style={[styles.logoText, textStyle]}>MindTrail</Text> : null}
    </View>
  );
}

export function TrailMotif({
  tone = "teal",
  compact = false,
  style,
}: {
  tone?: TrailTone;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = trailToneStyles[tone];
  const sizeStyle = compact ? styles.trailCompact : styles.trailDefault;

  return (
    <View pointerEvents="none" style={[styles.trailMotif, sizeStyle, style]}>
      <View style={[styles.trailSegment, styles.trailSegmentOne, colors.segmentPrimary]} />
      <View style={[styles.trailSegment, styles.trailSegmentTwo, colors.segmentSecondary]} />
      <View style={[styles.trailSegment, styles.trailSegmentThree, colors.segmentAccent]} />
      <View style={[styles.trailDot, styles.trailDotStart, colors.dotPrimary]} />
      <View style={[styles.trailDot, styles.trailDotMiddle, colors.dotSecondary]} />
      <View style={[styles.trailDot, styles.trailDotEnd, colors.dotAccent]} />
      <View style={[styles.trailPin, colors.pin]} />
    </View>
  );
}

export function SoftBackground({
  children,
  style,
  contentStyle,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.softBackground, style]}>
      <View pointerEvents="none" style={styles.backgroundCircleTeal} />
      <View pointerEvents="none" style={styles.backgroundCircleLavender} />
      <View pointerEvents="none" style={styles.backgroundCircleSage} />
      <TrailMotif tone="brown" style={styles.backgroundTrail} />
      <View style={[styles.softBackgroundContent, contentStyle]}>{children}</View>
    </View>
  );
}

export function JourneyPath({
  currentStep = 1,
  totalSteps = 4,
  labels,
  style,
}: {
  currentStep?: number;
  totalSteps?: number;
  labels?: string[];
  style?: StyleProp<ViewStyle>;
}) {
  const safeTotal = Math.max(1, totalSteps);
  const safeCurrent = Math.min(Math.max(1, currentStep), safeTotal);
  const steps = Array.from({ length: safeTotal }, (_, index) => index + 1);

  return (
    <View
      accessibilityLabel={`Journey step ${safeCurrent} of ${safeTotal}`}
      style={[styles.journeyPath, style]}
    >
      {steps.map((step) => {
        const isComplete = step < safeCurrent;
        const isActive = step === safeCurrent;
        const label = labels?.[step - 1];

        return (
          <View key={step} style={styles.journeyStepWrap}>
            <View
              style={[
                styles.journeyNode,
                isComplete && styles.journeyNodeComplete,
                isActive && styles.journeyNodeActive,
              ]}
            >
              <View
                style={[
                  styles.journeyNodeInner,
                  isComplete && styles.journeyNodeInnerComplete,
                  isActive && styles.journeyNodeInnerActive,
                ]}
              />
            </View>
            {label ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.journeyLabel,
                  (isComplete || isActive) && styles.journeyLabelActive,
                ]}
              >
                {label}
              </Text>
            ) : null}
            {step < safeTotal ? (
              <View
                style={[
                  styles.journeyConnector,
                  isComplete && styles.journeyConnectorComplete,
                ]}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function MindTrailHero({
  eyebrow = "Guided cognitive wellness journey",
  title = "MindTrail",
  subtitle = "A calm path for collecting cognitive risk signals and preparing GP-ready discussion notes.",
  step = 1,
  totalSteps = 4,
  style,
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  step?: number;
  totalSteps?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SoftBackground style={[styles.hero, style]} contentStyle={styles.heroContent}>
      <View style={styles.heroHeader}>
        <MindTrailLogo size="lg" />
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>Wellness journey</Text>
        </View>
      </View>
      <View style={styles.heroCopy}>
        <Text style={styles.heroEyebrow}>{eyebrow}</Text>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroSubtitle}>{subtitle}</Text>
      </View>
      <JourneyPath
        currentStep={step}
        labels={["Start", "Share", "Draw", "Review"]}
        totalSteps={totalSteps}
        style={styles.heroPath}
      />
      <Text style={styles.heroDisclaimer}>{DISCLAIMER}</Text>
    </SoftBackground>
  );
}

export function ReportVisualCard({
  title,
  signalLabel,
  signalTone = "uncertain",
  summary,
  children,
  showDisclaimer = true,
  style,
}: {
  title: string;
  signalLabel?: string;
  signalTone?: SignalTone;
  summary?: string;
  children?: ReactNode;
  showDisclaimer?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const signalStyles = signalToneStyles[signalTone];

  return (
    <View style={[styles.reportCard, style]}>
      <View style={styles.reportCardHeader}>
        <View style={styles.reportTitleWrap}>
          <Text style={styles.reportEyebrow}>Journey report</Text>
          <Text style={styles.reportTitle}>{title}</Text>
        </View>
        {signalLabel ? (
          <View style={[styles.signalBadge, signalStyles.badge]}>
            <View style={[styles.signalDot, signalStyles.dot]} />
            <Text style={[styles.signalBadgeText, signalStyles.text]}>{signalLabel}</Text>
          </View>
        ) : null}
      </View>
      {summary ? <Text style={styles.reportSummary}>{summary}</Text> : null}
      <TrailMotif compact tone="sage" style={styles.reportTrail} />
      {children ? <View style={styles.reportBody}>{children}</View> : null}
      {showDisclaimer ? <Text style={styles.reportDisclaimer}>{DISCLAIMER}</Text> : null}
    </View>
  );
}

export function StatusLegend({
  items = defaultLegendItems,
  style,
}: {
  items?: LegendItem[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.legend, style]}>
      <Text style={styles.legendTitle}>Signal guide</Text>
      <View style={styles.legendItems}>
        {items.map((item) => {
          const tone = signalToneStyles[item.tone];

          return (
            <View key={`${item.tone}-${item.label}`} style={styles.legendItem}>
              <View style={[styles.legendDot, tone.dot]} />
              <View style={styles.legendCopy}>
                <Text style={styles.legendLabel}>{item.label}</Text>
                {item.description ? (
                  <Text style={styles.legendDescription}>{item.description}</Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      <Text style={styles.legendNote}>Signals guide follow-up conversations; they are not diagnostic.</Text>
    </View>
  );
}

const logoMarkStyles: Record<LogoSize, { mark: ViewStyle; glow: ViewStyle; dot: ViewStyle; trailOne: ViewStyle; trailTwo: ViewStyle }> = {
  sm: {
    mark: { width: 32, height: 32, borderRadius: 16 },
    glow: { width: 20, height: 20, borderRadius: 10, left: 6, top: 5 },
    dot: { width: 7, height: 7, borderRadius: 4, left: 8, top: 8 },
    trailOne: { width: 15, height: 9, left: 11, top: 15 },
    trailTwo: { width: 11, height: 8, left: 16, top: 12 },
  },
  md: {
    mark: { width: 42, height: 42, borderRadius: 21 },
    glow: { width: 27, height: 27, borderRadius: 14, left: 8, top: 7 },
    dot: { width: 9, height: 9, borderRadius: 5, left: 11, top: 11 },
    trailOne: { width: 20, height: 12, left: 15, top: 20 },
    trailTwo: { width: 14, height: 10, left: 21, top: 16 },
  },
  lg: {
    mark: { width: 56, height: 56, borderRadius: 28 },
    glow: { width: 36, height: 36, borderRadius: 18, left: 11, top: 9 },
    dot: { width: 12, height: 12, borderRadius: 6, left: 15, top: 15 },
    trailOne: { width: 27, height: 16, left: 20, top: 27 },
    trailTwo: { width: 19, height: 13, left: 28, top: 22 },
  },
};

const logoTextStyles: Record<LogoSize, TextStyle> = {
  sm: {
    fontSize: 16,
    lineHeight: 21,
  },
  md: {
    fontSize: 20,
    lineHeight: 26,
  },
  lg: {
    fontSize: 26,
    lineHeight: 32,
  },
};

const trailToneStyles: Record<TrailTone, {
  dotPrimary: ViewStyle;
  dotSecondary: ViewStyle;
  dotAccent: ViewStyle;
  pin: ViewStyle;
  segmentPrimary: ViewStyle;
  segmentSecondary: ViewStyle;
  segmentAccent: ViewStyle;
}> = {
  teal: {
    dotPrimary: { backgroundColor: mindTrailPalette.teal },
    dotSecondary: { backgroundColor: mindTrailPalette.sageDeep },
    dotAccent: { backgroundColor: mindTrailPalette.lavenderDeep },
    pin: { borderColor: mindTrailPalette.teal },
    segmentPrimary: { backgroundColor: "rgba(49, 92, 99, 0.56)" },
    segmentSecondary: { backgroundColor: "rgba(88, 111, 77, 0.52)" },
    segmentAccent: { backgroundColor: "rgba(98, 84, 168, 0.48)" },
  },
  sage: {
    dotPrimary: { backgroundColor: mindTrailPalette.sageDeep },
    dotSecondary: { backgroundColor: mindTrailPalette.teal },
    dotAccent: { backgroundColor: mindTrailPalette.brown },
    pin: { borderColor: mindTrailPalette.sageDeep },
    segmentPrimary: { backgroundColor: "rgba(88, 111, 77, 0.52)" },
    segmentSecondary: { backgroundColor: "rgba(49, 92, 99, 0.48)" },
    segmentAccent: { backgroundColor: "rgba(139, 111, 71, 0.46)" },
  },
  lavender: {
    dotPrimary: { backgroundColor: mindTrailPalette.lavenderDeep },
    dotSecondary: { backgroundColor: mindTrailPalette.teal },
    dotAccent: { backgroundColor: mindTrailPalette.brown },
    pin: { borderColor: mindTrailPalette.lavenderDeep },
    segmentPrimary: { backgroundColor: "rgba(98, 84, 168, 0.48)" },
    segmentSecondary: { backgroundColor: "rgba(49, 92, 99, 0.48)" },
    segmentAccent: { backgroundColor: "rgba(139, 111, 71, 0.42)" },
  },
  brown: {
    dotPrimary: { backgroundColor: mindTrailPalette.brown },
    dotSecondary: { backgroundColor: mindTrailPalette.teal },
    dotAccent: { backgroundColor: mindTrailPalette.sageDeep },
    pin: { borderColor: mindTrailPalette.brown },
    segmentPrimary: { backgroundColor: "rgba(139, 111, 71, 0.42)" },
    segmentSecondary: { backgroundColor: "rgba(49, 92, 99, 0.42)" },
    segmentAccent: { backgroundColor: "rgba(88, 111, 77, 0.38)" },
  },
};

const signalToneStyles: Record<SignalTone, { badge: ViewStyle; dot: ViewStyle; text: TextStyle }> = {
  low: {
    badge: {
      borderColor: "rgba(88, 111, 77, 0.34)",
      backgroundColor: "rgba(215, 228, 206, 0.72)",
    },
    dot: { backgroundColor: mindTrailPalette.sageDeep },
    text: { color: mindTrailPalette.sageDeep },
  },
  watch: {
    badge: {
      borderColor: "rgba(139, 111, 71, 0.34)",
      backgroundColor: "rgba(238, 226, 208, 0.78)",
    },
    dot: { backgroundColor: mindTrailPalette.brown },
    text: { color: mindTrailPalette.brown },
  },
  review: {
    badge: {
      borderColor: "rgba(98, 84, 168, 0.3)",
      backgroundColor: "rgba(222, 216, 244, 0.72)",
    },
    dot: { backgroundColor: mindTrailPalette.lavenderDeep },
    text: { color: mindTrailPalette.lavenderDeep },
  },
  uncertain: {
    badge: {
      borderColor: "rgba(49, 92, 99, 0.28)",
      backgroundColor: "rgba(221, 236, 238, 0.68)",
    },
    dot: { backgroundColor: mindTrailPalette.teal },
    text: { color: mindTrailPalette.tealDeep },
  },
};

const styles = StyleSheet.create({
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  logoMark: {
    overflow: "hidden",
    backgroundColor: mindTrailPalette.tealMist,
    borderWidth: 1,
    borderColor: "rgba(49, 92, 99, 0.18)",
  },
  logoGlow: {
    position: "absolute",
    backgroundColor: "rgba(255, 252, 246, 0.8)",
  },
  logoDot: {
    position: "absolute",
    backgroundColor: mindTrailPalette.teal,
  },
  logoTrailOne: {
    position: "absolute",
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: mindTrailPalette.brown,
    borderBottomLeftRadius: 15,
    transform: [{ rotate: "-16deg" }],
  },
  logoTrailTwo: {
    position: "absolute",
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: mindTrailPalette.lavenderDeep,
    borderTopRightRadius: 14,
    transform: [{ rotate: "19deg" }],
  },
  logoText: {
    color: mindTrailPalette.ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  trailMotif: {
    overflow: "visible",
  },
  trailDefault: {
    width: 168,
    height: 82,
  },
  trailCompact: {
    width: 122,
    height: 58,
  },
  trailDot: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  trailDotStart: {
    left: 6,
    top: "62%",
  },
  trailDotMiddle: {
    left: "43%",
    top: "17%",
  },
  trailDotEnd: {
    right: 8,
    top: "49%",
  },
  trailSegment: {
    position: "absolute",
    height: 3,
    borderRadius: 999,
  },
  trailSegmentOne: {
    left: "11%",
    top: "57%",
    width: "39%",
    transform: [{ rotate: "-25deg" }],
  },
  trailSegmentTwo: {
    left: "47%",
    top: "35%",
    width: "34%",
    transform: [{ rotate: "22deg" }],
  },
  trailSegmentThree: {
    left: "71%",
    top: "54%",
    width: "18%",
    transform: [{ rotate: "-8deg" }],
  },
  trailPin: {
    position: "absolute",
    left: "38%",
    top: "7%",
    width: 25,
    height: 25,
    borderWidth: 1,
    borderRadius: 13,
    opacity: 0.2,
  },
  softBackground: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: mindTrailPalette.ivory,
    borderWidth: 1,
    borderColor: "rgba(139, 111, 71, 0.14)",
  },
  softBackgroundContent: {
    position: "relative",
    zIndex: 2,
  },
  backgroundCircleTeal: {
    position: "absolute",
    right: -44,
    top: -48,
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: "rgba(221, 236, 238, 0.78)",
  },
  backgroundCircleLavender: {
    position: "absolute",
    left: -38,
    bottom: -46,
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: "rgba(222, 216, 244, 0.58)",
  },
  backgroundCircleSage: {
    position: "absolute",
    right: 58,
    bottom: 28,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(215, 228, 206, 0.68)",
  },
  backgroundTrail: {
    position: "absolute",
    right: 18,
    bottom: 12,
    opacity: 0.55,
  },
  journeyPath: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
  },
  journeyStepWrap: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  journeyNode: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: mindTrailPalette.border,
    borderRadius: 12,
    backgroundColor: mindTrailPalette.ivorySoft,
  },
  journeyNodeComplete: {
    borderColor: "rgba(88, 111, 77, 0.48)",
    backgroundColor: mindTrailPalette.sage,
  },
  journeyNodeActive: {
    borderColor: mindTrailPalette.teal,
    backgroundColor: mindTrailPalette.tealMist,
  },
  journeyNodeInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(102, 112, 133, 0.36)",
  },
  journeyNodeInnerComplete: {
    backgroundColor: mindTrailPalette.sageDeep,
  },
  journeyNodeInnerActive: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: mindTrailPalette.teal,
  },
  journeyLabel: {
    maxWidth: 62,
    marginLeft: 7,
    color: mindTrailPalette.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
  },
  journeyLabelActive: {
    color: mindTrailPalette.tealDeep,
  },
  journeyConnector: {
    width: 30,
    height: 2,
    marginHorizontal: 7,
    borderRadius: 999,
    backgroundColor: mindTrailPalette.border,
  },
  journeyConnectorComplete: {
    backgroundColor: "rgba(88, 111, 77, 0.58)",
  },
  hero: {
    borderRadius: 30,
    padding: 22,
    shadowColor: "#6F5D43",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.12,
    shadowRadius: 30,
    elevation: 3,
  },
  heroContent: {
    gap: 22,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  heroBadge: {
    flexShrink: 0,
    borderWidth: 1,
    borderColor: "rgba(139, 111, 71, 0.22)",
    borderRadius: 999,
    backgroundColor: "rgba(255, 252, 246, 0.78)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  heroBadgeText: {
    color: mindTrailPalette.brown,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
  },
  heroCopy: {
    maxWidth: 560,
  },
  heroEyebrow: {
    marginBottom: 8,
    color: mindTrailPalette.brown,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0,
  },
  heroTitle: {
    color: mindTrailPalette.ink,
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 46,
  },
  heroSubtitle: {
    marginTop: 10,
    color: mindTrailPalette.tealDeep,
    fontSize: 17,
    fontWeight: "500",
    letterSpacing: 0,
    lineHeight: 25,
  },
  heroPath: {
    maxWidth: 520,
  },
  heroDisclaimer: {
    color: mindTrailPalette.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0,
    lineHeight: 18,
  },
  reportCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(139, 111, 71, 0.16)",
    borderRadius: 28,
    backgroundColor: mindTrailPalette.ivorySoft,
    padding: 20,
    shadowColor: "#6F5D43",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 2,
  },
  reportCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  reportTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  reportEyebrow: {
    marginBottom: 6,
    color: mindTrailPalette.brown,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  reportTitle: {
    color: mindTrailPalette.ink,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 30,
  },
  signalBadge: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 7,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  signalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  signalBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
  },
  reportSummary: {
    marginTop: 14,
    color: mindTrailPalette.tealDeep,
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0,
    lineHeight: 22,
  },
  reportTrail: {
    marginTop: 10,
    marginBottom: 6,
    opacity: 0.86,
  },
  reportBody: {
    marginTop: 8,
  },
  reportDisclaimer: {
    marginTop: 16,
    color: mindTrailPalette.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0,
    lineHeight: 18,
  },
  legend: {
    borderWidth: 1,
    borderColor: "rgba(139, 111, 71, 0.16)",
    borderRadius: 22,
    backgroundColor: "rgba(255, 252, 246, 0.86)",
    padding: 16,
  },
  legendTitle: {
    marginBottom: 12,
    color: mindTrailPalette.ink,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0,
  },
  legendItems: {
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  legendDot: {
    width: 11,
    height: 11,
    marginTop: 4,
    borderRadius: 6,
  },
  legendCopy: {
    flex: 1,
    minWidth: 0,
  },
  legendLabel: {
    color: mindTrailPalette.tealDeep,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 18,
  },
  legendDescription: {
    marginTop: 1,
    color: mindTrailPalette.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0,
    lineHeight: 17,
  },
  legendNote: {
    marginTop: 14,
    color: mindTrailPalette.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0,
    lineHeight: 18,
  },
});
