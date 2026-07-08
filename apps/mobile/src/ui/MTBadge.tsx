import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";

import { mtColors, mtFontWeight, mtRadii, mtSpacing } from "./theme";

export type MTBadgeTone =
  | "neutral"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "lavender"
  | "sage";

export type MTBadgeProps = {
  label: string;
  tone?: MTBadgeTone;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function MTBadge({ label, tone = "neutral", style, textStyle }: MTBadgeProps) {
  return (
    <View style={[styles.badge, badgeStyles[tone], style]}>
      <Text numberOfLines={2} style={[styles.label, badgeTextStyles[tone], textStyle]}>
        {label}
      </Text>
    </View>
  );
}

const badgeStyles: Record<MTBadgeTone, ViewStyle> = {
  neutral: {
    borderColor: mtColors.mtBorder,
    backgroundColor: mtColors.mtSurfaceSoft,
  },
  primary: {
    borderColor: mtColors.mtPrimary,
    backgroundColor: mtColors.mtPrimarySoft,
  },
  accent: {
    borderColor: mtColors.mtAccent,
    backgroundColor: mtColors.mtAccentSoft,
  },
  success: {
    borderColor: mtColors.mtSuccess,
    backgroundColor: mtColors.mtSuccessSoft,
  },
  warning: {
    borderColor: mtColors.mtWarning,
    backgroundColor: mtColors.mtWarningSoft,
  },
  danger: {
    borderColor: mtColors.mtDanger,
    backgroundColor: mtColors.mtDangerSoft,
  },
  lavender: {
    borderColor: mtColors.mtLavenderDark,
    backgroundColor: mtColors.mtLavender,
  },
  sage: {
    borderColor: mtColors.mtSageDark,
    backgroundColor: mtColors.mtSage,
  },
};

const badgeTextStyles: Record<MTBadgeTone, TextStyle> = {
  neutral: {
    color: mtColors.mtMuted,
  },
  primary: {
    color: mtColors.mtPrimaryDark,
  },
  accent: {
    color: mtColors.mtAccent,
  },
  success: {
    color: mtColors.mtSuccess,
  },
  warning: {
    color: mtColors.mtWarning,
  },
  danger: {
    color: mtColors.mtDanger,
  },
  lavender: {
    color: mtColors.mtLavenderDark,
  },
  sage: {
    color: mtColors.mtSageDark,
  },
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: mtRadii.pill,
    paddingHorizontal: mtSpacing.sm,
    paddingVertical: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: mtFontWeight.extraBold,
    letterSpacing: 0,
    lineHeight: 18,
    textAlign: "center",
  },
});
