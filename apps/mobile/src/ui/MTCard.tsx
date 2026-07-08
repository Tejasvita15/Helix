import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { mtColors, mtRadii, mtShadows, mtSpacing } from "./theme";

export type MTCardTone = "neutral" | "primary" | "accent" | "sage" | "lavender" | "warning";

export type MTCardProps = {
  children: ReactNode;
  tone?: MTCardTone;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function MTCard({ children, tone = "neutral", padded = true, style }: MTCardProps) {
  return <View style={[styles.card, toneStyles[tone], !padded && styles.flush, style]}>{children}</View>;
}

const toneStyles: Record<MTCardTone, ViewStyle> = {
  neutral: {},
  primary: {
    borderColor: mtColors.mtPrimarySoft,
    backgroundColor: mtColors.mtSurfaceSoft,
  },
  accent: {
    borderColor: mtColors.mtAccentSoft,
    backgroundColor: mtColors.mtSurfaceSoft,
  },
  sage: {
    borderColor: mtColors.mtSage,
    backgroundColor: "#FAFCF8",
  },
  lavender: {
    borderColor: mtColors.mtLavender,
    backgroundColor: "#FBFAFF",
  },
  warning: {
    borderColor: mtColors.mtWarningSoft,
    backgroundColor: mtColors.mtWarningSoft,
  },
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: mtColors.mtBorder,
    borderRadius: mtRadii.card,
    backgroundColor: mtColors.mtSurface,
    padding: mtSpacing.xl,
    ...mtShadows.card,
  },
  flush: {
    padding: 0,
  },
});
