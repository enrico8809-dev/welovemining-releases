import React, { useState } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Field from "./Field";
import { AmountDraft, NO_DRAFT, amountText, amountTyped } from "../lib/amountField";
import { parseAmount } from "../lib/format";

interface NumberFieldProps {
  label?: string;
  value: number;
  onChangeValue: (n: number) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A field for a number the caller stores as a number — a rate, a fee, a margin.
 *
 * Holding what was typed matters more here than it looks. Deriving the text back
 * from the number swallows a decimal point the moment it is typed, because
 * "18." parses to 18 and returns as "18"; the next key then lands in the units
 * column and the rate becomes 185. That made the USD/ZAR rate — which every
 * landed cost is built on — impossible to enter correctly.
 */
export default function NumberField({
  label,
  value,
  onChangeValue,
  placeholder = "0",
  style,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<AmountDraft>(NO_DRAFT);

  // A zero shows as an empty field, so it doesn't have to be deleted first.
  const text = amountText(draft, value ? String(value) : "");

  return (
    <Field
      label={label}
      value={text}
      onChangeText={(input) => {
        const next = amountTyped(input);
        setDraft(next.draft);
        const n = parseAmount(next.emit);
        onChangeValue(Number.isFinite(n) ? n : 0);
      }}
      onFocus={() => setDraft(NO_DRAFT)}
      onBlur={() => setDraft(NO_DRAFT)}
      placeholder={placeholder}
      keyboardType="decimal-pad"
      mono
      style={style}
    />
  );
}
