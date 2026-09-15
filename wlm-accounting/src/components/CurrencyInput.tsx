import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { C, R, S, T } from "../lib/theme";
import {
  AmountDraft,
  NO_DRAFT,
  amountBlurred,
  amountText,
  amountTyped,
} from "../lib/amountField";

interface CurrencyInputProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Shown beneath the field when the value fails validation. */
  error?: string;
}

/**
 * Amount field with a permanent R prefix. Formats to two decimals with thousands
 * separators on blur, but leaves the raw text alone while typing so the caret
 * doesn't jump around.
 *
 * While the field is being typed into it shows what was typed, not what the
 * parent made of it — see lib/amountField, which holds that rule and its tests.
 */
export default function CurrencyInput({
  value,
  onChangeText,
  placeholder = "0.00",
  autoFocus,
  error,
}: CurrencyInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<AmountDraft>(NO_DRAFT);

  const text = amountText(draft, value);

  const handleChangeText = (input: string) => {
    const next = amountTyped(input);
    setDraft(next.draft);
    onChangeText(next.emit);
  };

  const handleFocus = () => {
    setFocused(true);
    setDraft(NO_DRAFT);
  };

  const handleBlur = () => {
    setFocused(false);
    const next = amountBlurred(text);
    setDraft(next.draft);
    if (next.emit !== null) onChangeText(next.emit);
  };

  return (
    <View>
      <View
        style={[
          styles.field,
          focused && styles.focused,
          !!error && styles.invalid,
        ]}
      >
        <Text style={styles.prefix}>R</Text>
        <TextInput
          value={text}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor={C.mute}
          keyboardType="decimal-pad"
          autoFocus={autoFocus}
          style={styles.input}
          selectionColor={C.orange}
        />
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm,
    backgroundColor: C.panel2,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: S.lg,
  },
  focused: { borderColor: C.orange },
  invalid: { borderColor: C.red },
  prefix: { ...T.amountLg, color: C.mute },
  input: {
    ...T.amountLg,
    color: C.text,
    flex: 1,
    paddingVertical: S.md,
  },
  error: { ...T.small, color: C.red, marginTop: S.xs + 2 },
});
