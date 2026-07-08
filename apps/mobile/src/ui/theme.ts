import type { TextStyle, ViewStyle } from "react-native";

export const mtColors = {
  mtInk: "#172033",
  mtMuted: "#667085",
  mtBg: "#F7F3EA",
  mtSurface: "#FFFFFF",
  mtSurfaceSoft: "#FFFBF4",
  mtPrimary: "#315C63",
  mtPrimaryDark: "#23464C",
  mtPrimarySoft: "#DDECEE",
  mtAccent: "#8B6F47",
  mtAccentSoft: "#EFE3D0",
  mtLavender: "#DCD7F8",
  mtLavenderDark: "#6254A8",
  mtSage: "#DCE8D5",
  mtSageDark: "#4F6F52",
  mtWarning: "#B7791F",
  mtWarningSoft: "#FFF3CD",
  mtDanger: "#B42318",
  mtDangerSoft: "#FEE4E2",
  mtSuccess: "#2F7D5C",
  mtSuccessSoft: "#DDF3E8",
  mtBorder: "#E6DED1",
  mtShadow: "#6F5D43",
} as const;

export const mtSpacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const mtRadii = {
  sm: 12,
  md: 16,
  lg: 20,
  card: 24,
  screen: 28,
  pill: 999,
} as const;

export const mtFontWeight = {
  regular: "400" as TextStyle["fontWeight"],
  medium: "500" as TextStyle["fontWeight"],
  semibold: "600" as TextStyle["fontWeight"],
  bold: "700" as TextStyle["fontWeight"],
  extraBold: "800" as TextStyle["fontWeight"],
} as const;

export const mtType = {
  screenTitle: {
    color: mtColors.mtInk,
    fontSize: 32,
    fontWeight: mtFontWeight.extraBold,
    letterSpacing: 0,
    lineHeight: 40,
  },
  sectionTitle: {
    color: mtColors.mtInk,
    fontSize: 22,
    fontWeight: mtFontWeight.bold,
    letterSpacing: 0,
    lineHeight: 30,
  },
  body: {
    color: mtColors.mtInk,
    fontSize: 18,
    fontWeight: mtFontWeight.regular,
    letterSpacing: 0,
    lineHeight: 28,
  },
  bodyStrong: {
    color: mtColors.mtInk,
    fontSize: 18,
    fontWeight: mtFontWeight.semibold,
    letterSpacing: 0,
    lineHeight: 28,
  },
  helper: {
    color: mtColors.mtMuted,
    fontSize: 15,
    fontWeight: mtFontWeight.regular,
    letterSpacing: 0,
    lineHeight: 22,
  },
  eyebrow: {
    color: mtColors.mtAccent,
    fontSize: 14,
    fontWeight: mtFontWeight.extraBold,
    letterSpacing: 0,
    lineHeight: 20,
  },
  button: {
    fontSize: 18,
    fontWeight: mtFontWeight.extraBold,
    letterSpacing: 0,
    lineHeight: 25,
  },
} as const;

export const mtShadows = {
  card: {
    shadowColor: mtColors.mtShadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 2,
  } satisfies ViewStyle,
  screen: {
    shadowColor: mtColors.mtShadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 3,
  } satisfies ViewStyle,
} as const;

export const mtTheme = {
  colors: mtColors,
  spacing: mtSpacing,
  radii: mtRadii,
  fontWeight: mtFontWeight,
  type: mtType,
  shadows: mtShadows,
} as const;

export type MTColorToken = keyof typeof mtColors;
