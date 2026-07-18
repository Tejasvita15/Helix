import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PressableProps, StyleProp, TextStyle, ViewStyle } from "react-native";

import { mtColors, mtRadii, mtSpacing, mtType } from "./theme";

export type MTChoiceCardProps = Omit<PressableProps, "children" | "style"> & {
  title: string;
  helper?: string;
  selected?: boolean;
  children?: ReactNode;
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  helperStyle?: StyleProp<TextStyle>;
};

export function MTChoiceCard({
  title,
  helper,
  selected,
  children,
  minHeight,
  style,
  titleStyle,
  helperStyle,
  accessibilityRole = "button",
  ...pressableProps
}: MTChoiceCardProps) {
  return (
    <Pressable
      {...pressableProps}
      accessibilityRole={accessibilityRole}
      style={[styles.card, selected && styles.selected, minHeight ? { minHeight } : null, style]}
    >
      <View style={styles.copy}>
        <Text style={[styles.title, titleStyle]}>{title}</Text>
        {helper ? <Text style={[styles.helper, helperStyle]}>{helper}</Text> : null}
      </View>
      {children ? <View style={styles.accessory}>{children}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mtSpacing.md,
    marginBottom: mtSpacing.sm,
    borderWidth: 1,
    borderColor: mtColors.mtBorder,
    borderRadius: mtRadii.card,
    backgroundColor: mtColors.mtSurface,
    padding: mtSpacing.md,
  },
  selected: {
    borderColor: mtColors.mtPrimary,
    backgroundColor: mtColors.mtPrimarySoft,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...mtType.bodyStrong,
    fontWeight: "800",
  },
  helper: {
    ...mtType.helper,
    marginTop: mtSpacing.xxs,
    fontWeight: "600",
  },
  accessory: {
    flexShrink: 0,
  },
});
