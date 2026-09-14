import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle, CheckCircle2, Clock, FileText, XCircle } from "lucide-react-native";
import { BusinessDoc, isOverdue, statusLabel } from "../lib/invoices";
import { C, R, S, T } from "../lib/theme";

/**
 * Document status. Colour never travels alone here — each state carries its own
 * icon and its own word, so the badge still reads in greyscale or with CVD.
 */
export default function StatusBadge({ doc }: { doc: BusinessDoc }) {
  const { color, Icon } = resolve(doc);
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Icon color={color} size={12} />
      <Text style={[styles.text, { color }]}>{statusLabel(doc)}</Text>
    </View>
  );
}

function resolve(doc: BusinessDoc) {
  if (isOverdue(doc)) return { color: C.red, Icon: AlertTriangle };
  switch (doc.status) {
    case "paid":
    case "accepted":
      return { color: C.green, Icon: CheckCircle2 };
    case "sent":
      return { color: C.amber, Icon: Clock };
    case "declined":
    case "void":
      return { color: C.mute, Icon: XCircle };
    default:
      return { color: C.mute, Icon: FileText };
  }
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.xs + 1,
    borderWidth: 1,
    borderRadius: R.pill,
    paddingHorizontal: S.sm + 2,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  text: { ...T.label, fontSize: 10 },
});
