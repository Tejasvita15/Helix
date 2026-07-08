import { StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import { mtColors, mtSpacing, mtType } from "./theme";

export type MTSectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function MTSectionHeader({
  eyebrow,
  title,
  description,
  action,
  style,
}: MTSectionHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.row}>
        <View style={styles.copy}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  copy: {
    minWidth: 0,
    flex: 1,
  },
  eyebrow: {
    ...mtType.eyebrow,
    marginBottom: mtSpacing.xs,
  },
  title: {
    ...mtType.sectionTitle,
  },
  description: {
    ...mtType.helper,
    color: mtColors.mtMuted,
    marginTop: mtSpacing.xs,
  },
  action: {
    flexShrink: 0,
    marginLeft: mtSpacing.md,
  },
});
