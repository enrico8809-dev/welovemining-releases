import React, { useState } from "react";
import {
  KeyboardTypeOptions,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { C, R, S, T } from "../lib/theme";

interface FieldProps {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  error?: string;
  mono?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  style?: StyleProp<ViewStyle>;
  onFocus?: () => void;
  onBlur?: () => void;
}

export default function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  error,
  mono,
  autoCapitalize = "sentences",
  style,
  onFocus,
  onBlur,
}: FieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={style}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        placeholder={placeholder}
        placeholderTextColor={C.mute}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        selectionColor={C.orange}
        style={[
          styles.input,
          mono && styles.mono,
          multiline && styles.multiline,
          focused && styles.focused,
          !!error && styles.invalid,
        ]}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...T.label, color: C.mute, marginBottom: S.sm },
  input: {
    ...T.body,
    color: C.text,
    backgroundColor: C.panel2,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: S.lg,
    paddingVertical: S.md + 2,
  },
  mono: { ...T.amount },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  focused: { borderColor: C.orange },
  invalid: { borderColor: C.red },
  error: { ...T.small, color: C.red, marginTop: S.xs + 2 },
});
