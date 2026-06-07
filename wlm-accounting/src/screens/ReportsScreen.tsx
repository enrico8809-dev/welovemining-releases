import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import { useLedger } from "../lib/LedgerContext";
import { computeProfitAndLoss, computeTrialBalance } from "../lib/accounting";
import { fmt } from "../lib/format";
import { C, FONT_DISPLAY, FONT_DISPLAY_BOLD, FONT_MONO } from "../lib/theme";

export default function ReportsScreen() {
  const { accounts, balances } = useLedger();

  const pnl = useMemo(() => computeProfitAndLoss(accounts, balances), [accounts, balances]);
  const trialBalance = useMemo(() => computeTrialBalance(accounts, balances), [accounts, balances]);
  const balanced = Math.abs(trialBalance.totalDebit - trialBalance.totalCredit) < 0.005;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header />

      <Card>
        <Text style={styles.title}>PROFIT &amp; LOSS</Text>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Income</Text>
          <Text style={[styles.lineAmount, { color: C.green }]}>{fmt(pnl.income)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Expenses</Text>
          <Text style={[styles.lineAmount, { color: C.red }]}>{fmt(pnl.expenses)}</Text>
        </View>
        <View style={[styles.line, styles.netLine]}>
          <Text style={[styles.lineLabel, { fontFamily: FONT_DISPLAY_BOLD }]}>Net</Text>
          <Text style={[styles.lineAmount, { color: pnl.net >= 0 ? C.green : C.red, fontFamily: FONT_MONO }]}>
            {fmt(pnl.net)}
          </Text>
        </View>
      </Card>

      <Card>
        <View style={styles.tbHeader}>
          <Text style={styles.title}>TRIAL BALANCE</Text>
          <View style={[styles.badge, { backgroundColor: balanced ? C.green : C.red }]}>
            <Text style={styles.badgeText}>{balanced ? "BALANCED" : "OUT OF BALANCE"}</Text>
          </View>
        </View>

        <View style={[styles.tbRow, styles.tbHeaderRow]}>
          <Text style={[styles.tbCell, styles.tbAccountCell, styles.tbHeaderText]}>Account</Text>
          <Text style={[styles.tbCell, styles.tbHeaderText, { textAlign: "right" }]}>Debit</Text>
          <Text style={[styles.tbCell, styles.tbHeaderText, { textAlign: "right" }]}>Credit</Text>
        </View>

        {trialBalance.rows.map((row) => (
          <View key={row.account.id} style={styles.tbRow}>
            <Text style={[styles.tbCell, styles.tbAccountCell]} numberOfLines={1}>
              {row.account.name}
            </Text>
            <Text style={[styles.tbCell, styles.tbAmount, { textAlign: "right" }]}>
              {row.debit > 0 ? fmt(row.debit).replace("R ", "") : "—"}
            </Text>
            <Text style={[styles.tbCell, styles.tbAmount, { textAlign: "right" }]}>
              {row.credit > 0 ? fmt(row.credit).replace("R ", "") : "—"}
            </Text>
          </View>
        ))}

        <View style={[styles.tbRow, styles.tbTotalRow]}>
          <Text style={[styles.tbCell, styles.tbAccountCell, styles.tbHeaderText]}>Total</Text>
          <Text style={[styles.tbCell, styles.tbAmount, styles.tbHeaderText, { textAlign: "right" }]}>
            {fmt(trialBalance.totalDebit).replace("R ", "")}
          </Text>
          <Text style={[styles.tbCell, styles.tbAmount, styles.tbHeaderText, { textAlign: "right" }]}>
            {fmt(trialBalance.totalCredit).replace("R ", "")}
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  title: {
    color: C.mute,
    fontFamily: FONT_DISPLAY_BOLD,
    fontSize: 13,
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  netLine: {
    borderTopWidth: 1,
    borderTopColor: C.line,
    marginTop: 4,
  },
  lineLabel: { color: C.text, fontFamily: FONT_DISPLAY, fontSize: 15 },
  lineAmount: { fontFamily: FONT_MONO, fontSize: 15 },
  tbHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: C.bg, fontFamily: FONT_DISPLAY_BOLD, fontSize: 11, letterSpacing: 1 },
  tbRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  tbHeaderRow: { borderBottomColor: C.mute },
  tbTotalRow: { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: C.mute, marginTop: 2 },
  tbCell: { flex: 1, fontFamily: FONT_DISPLAY, fontSize: 13, color: C.text },
  tbAccountCell: { flex: 1.6 },
  tbHeaderText: { color: C.mute, fontFamily: FONT_DISPLAY_BOLD, fontSize: 12, letterSpacing: 0.5 },
  tbAmount: { fontFamily: FONT_MONO, fontSize: 13 },
});
