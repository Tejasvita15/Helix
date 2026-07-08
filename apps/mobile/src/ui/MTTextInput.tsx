import { StyleSheet, Text, TextInput, View } from "react-native";
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from "react-native";

import { mtColors, mtRadii, mtSpacing, mtType } from "./theme";

export type MTTextInputProps = TextInputProps & {
  label?: string;
  helperText?: string;
  errorText?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export function MTTextInput({
  label,
  helperText,
  errorText,
  containerStyle,
  style,
  multiline,
  accessibilityLabel,
  accessibilityHint,
  placeholderTextColor,
  ...inputProps
}: MTTextInputProps) {
  const supportingText = errorText ?? helperText;
  const hasError = Boolean(errorText);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...inputProps}
        accessibilityHint={accessibilityHint ?? supportingText}
        accessibilityLabel={accessibilityLabel ?? label}
        multiline={multiline}
        placeholderTextColor={placeholderTextColor ?? mtColors.mtMuted}
        style={[styles.input, multiline && styles.multiline, hasError && styles.inputError, style]}
      />
      {supportingText ? (
        <Text style={[styles.supportingText, hasError && styles.errorText]}>{supportingText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
  },
  label: {
    ...mtType.bodyStrong,
    marginBottom: mtSpacing.xs,
  },
  input: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: mtColors.mtBorder,
    borderRadius: mtRadii.lg,
    backgroundColor: mtColors.mtSurface,
    paddingHorizontal: mtSpacing.lg,
    paddingVertical: mtSpacing.md,
    color: mtColors.mtInk,
    fontSize: 18,
    lineHeight: 26,
  },
  multiline: {
    minHeight: 116,
    textAlignVertical: "top",
  },
  inputError: {
    borderColor: mtColors.mtDanger,
    backgroundColor: mtColors.mtDangerSoft,
  },
  supportingText: {
    ...mtType.helper,
    marginTop: mtSpacing.xs,
  },
  errorText: {
    color: mtColors.mtDanger,
    fontWeight: "600" as TextStyle["fontWeight"],
  },
});
