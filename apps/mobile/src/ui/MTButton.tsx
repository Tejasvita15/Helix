import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PressableProps, StyleProp, TextStyle, ViewStyle } from "react-native";

import { mtColors, mtRadii, mtSpacing, mtType } from "./theme";

export type MTButtonVariant = "primary" | "secondary" | "subtle" | "danger";
export type MTButtonSize = "large" | "medium";

export type MTButtonProps = Omit<PressableProps, "children" | "style"> & {
  label: string;
  variant?: MTButtonVariant;
  size?: MTButtonSize;
  fullWidth?: boolean;
  leftAccessory?: React.ReactNode;
  rightAccessory?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function MTButton({
  label,
  variant = "primary",
  size = "large",
  fullWidth = true,
  disabled,
  leftAccessory,
  rightAccessory,
  style,
  textStyle,
  accessibilityLabel,
  ...pressableProps
}: MTButtonProps) {
  return (
    <Pressable
      {...pressableProps}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        buttonSizeStyles[size],
        buttonVariantStyles[variant],
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        {leftAccessory ? <View style={styles.accessory}>{leftAccessory}</View> : null}
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.9}
          numberOfLines={2}
          style={[styles.label, textVariantStyles[variant], textStyle]}
        >
          {label}
        </Text>
        {rightAccessory ? <View style={styles.accessory}>{rightAccessory}</View> : null}
      </View>
    </Pressable>
  );
}

const buttonVariantStyles: Record<MTButtonVariant, ViewStyle> = {
  primary: {
    backgroundColor: mtColors.mtPrimary,
  },
  secondary: {
    borderWidth: 1,
    borderColor: mtColors.mtPrimary,
    backgroundColor: mtColors.mtSurfaceSoft,
  },
  subtle: {
    borderWidth: 1,
    borderColor: mtColors.mtBorder,
    backgroundColor: mtColors.mtSurface,
  },
  danger: {
    backgroundColor: mtColors.mtDanger,
  },
};

const textVariantStyles: Record<MTButtonVariant, TextStyle> = {
  primary: {
    color: mtColors.mtSurface,
  },
  secondary: {
    color: mtColors.mtPrimaryDark,
  },
  subtle: {
    color: mtColors.mtInk,
  },
  danger: {
    color: mtColors.mtSurface,
  },
};

const buttonSizeStyles: Record<MTButtonSize, ViewStyle> = {
  large: {
    minHeight: 64,
    paddingHorizontal: mtSpacing.xl,
    paddingVertical: mtSpacing.md,
  },
  medium: {
    minHeight: 54,
    paddingHorizontal: mtSpacing.lg,
    paddingVertical: mtSpacing.sm,
  },
};

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mtRadii.lg,
  },
  fullWidth: {
    alignSelf: "stretch",
  },
  content: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  accessory: {
    flexShrink: 0,
    marginHorizontal: mtSpacing.xs,
  },
  label: {
    ...mtType.button,
    flexShrink: 1,
    textAlign: "center",
  },
  disabled: {
    opacity: 0.54,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
});
