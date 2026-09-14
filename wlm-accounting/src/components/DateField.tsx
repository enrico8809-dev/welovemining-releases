import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import { C, R, S, T } from "../lib/theme";
import { fmtDate, parseISO, toISO } from "../lib/format";
import * as haptics from "../lib/haptics";

interface DateFieldProps {
  value: string; // ISO yyyy-mm-dd
  onChange: (iso: string) => void;
  label?: string;
}

/** Opens the platform date picker — no more typing dates by hand. */
export default function DateField({ value, onChange, label }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const current = parseISO(value) ?? new Date();

  const handleChange = (event: DateTimePickerEvent, picked?: Date) => {
    // Android fires once and dismisses itself; iOS stays open on the spinner.
    if (Platform.OS === "android") setOpen(false);
    if (event.type === "dismissed") return;
    if (picked) onChange(toISO(picked));
  };

  return (
    <View>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          haptics.tap();
          setOpen(true);
        }}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
      >
        <Calendar color={C.mute} size={18} />
        <Text style={styles.value}>{fmtDate(value)}</Text>
      </Pressable>

      {open && (
        <DateTimePicker
          value={current}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          themeVariant="dark"
          maximumDate={new Date(new Date().getFullYear() + 1, 11, 31)}
          onChange={handleChange}
        />
      )}

      {open && Platform.OS === "ios" && (
        <Pressable style={styles.done} onPress={() => setOpen(false)}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...T.label, color: C.mute, marginBottom: S.sm },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    backgroundColor: C.panel2,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: S.lg,
    paddingVertical: S.md + 2,
  },
  pressed: { borderColor: C.orange },
  value: { ...T.amount, color: C.text },
  done: { alignSelf: "flex-end", paddingVertical: S.sm, paddingHorizontal: S.md },
  doneText: { ...T.bodyBold, color: C.orange },
});
