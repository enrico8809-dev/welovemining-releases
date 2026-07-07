import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Scale } from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import { Pill, SectionLabel } from "../components/ui";
import { useLedger } from "../lib/LedgerContext";
import { computeProfitAndLoss, computeTrialBalance } from "../lib/accounting";
import { fmt } from "../lib/format";
import { C, FONT_DISPLAY, FONT_DISPLAY_BOLD, FONT_MONO, R } from "../lib/theme";

export default function ReportsScreen() {
  const { accounts, balances } = useLedger();

  const pnl = useMemo(() => computeProfitAndLoss(accounts, balances), [accounts, balances]);
  const trialBalance = useMemo(() => computeTrialBalance(accounts, balances), [accounts, balances]);
  const balanced = Math.abs(trialBalance.totalDebit - trialBalance.totalCredit) < 0.005;
  const total = pnl.income + pnl.expenses;
  const incomeShare = total > 0 ? pnl.income / total : 0.5;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header subtitle="Reports" />

      <Card>
        <SectionLabel style={{ marginBottom: 14 }}>PROFIT &amp; LOSS</SectionLabel>

        {/* income vs expense split bar */}
        <View style={styles.splitTrack}>
          <View style={[styles.splitIn, { flex: Math.max(incomeShare, 0.02) }]} />
          <View style={[styles.splitOut, { flex: Math.max(1 - incomeShare, 0.02) }]} />
        </View>

        <View style={styles.line}>
          <View style={styles.lineLeft}>
            <View style={[styles.key, { backgroundColor: C.green }]} />
            <Text style={styles.lineLabel}>Income</Text>
          </View>
          <Text style={[styles.lineAmount, { color: C.green }]}>{fmt(pnl.income)}</Text>
        </View>
        <View style={styles.line}>
          <View style={styles.lineLeft}>
            <View style={[styles.key, { backgroundColor: C.red }]} />
            <Text style={styles.lineLabel}>Expenses</Text>
          </View>
          <Text style={[styles.lineAmount, { color: C.red }]}>{fmt(pnl.expenses)}</Text>
        </View>

        <View style={styles.netBand}>
          <Text style={styles.netLabel}>NET PROFIT / (LOSS)</Text>
          <Text style={[styles.netAmount, { color: pnl.net >= 0 ? C.green : C.red }]}>{fmt(pnl.net)}</Text>
        </View>
      </Card>

      <Card>
        <View style={styles.tbHeader}>
          <View style={styles.lineLeft}>
            <Scale color={C.mute} size={15} />
            <SectionLabel>TRIAL BALANCE</SectionLabel>
          </View>
          <Pill
            label={balanced ? "BALANCED" : "OUT OF BALANCE"}
            color={balanced ? C.green : C.red}
            bg={balanced ? C.greenSoft : C.redSoft}
          />
        </View>

        <View style={[styles.tbRow, styles.tbHeaderRow]}>
          <Text style={[styles.tbCell, styles.tbAccountCell, styles.tbHeaderText]}>Account</Text>
          <Text style={[styles.tbCell, styles.tbHeaderText, { textAlign: "right" }]}>Debit</Text>
          <Text style={[styles.tbCell, styles.tbHeaderText, { textAlign: "right" }]}>Credit</Text>
        </View>

        {trialBalance.rows.map((row, i) => (
          <View key={row.account.id} style={[styles.tbRow, i % 2 === 1 && styles.tbZebra]}>
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
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  splitTrack: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 14,
    gap: 2,
  },
  splitIn: { backgroundColor: C.green, borderRadius: 4 },
  splitOut: { backgroundColor: C.red, borderRadius: 4 },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  lineLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  key: { width: 8, height: 8, borderRadius: 2 },
  lineLabel: { color: C.text, fontFamily: FONT_DISPLAY, fontSize: 15 },
  lineAmount: { fontFamily: FONT_MONO, fontSize: 15 },
  netBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    backgroundColor: C.panel2,
    borderRadius: R.sm + 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  netLabel: { color: C.mute, fontFamily: FONT_DISPLAY_BOLD, fontSize: 12, letterSpacing: 1.5 },
  netAmount: { fontFamily: FONT_MONO, fontSize: 18 },
  tbHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  tbRow: {
    flexDirection: "row",
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  tbZebra: { backgroundColor: "rgba(26,34,48,0.5)" },
  tbHeaderRow: { borderBottomWidth: 1, borderBottomColor: C.line, borderRadius: 0 },
  tbTotalRow: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 4, borderRadius: 0 },
  tbCell: { flex: 1, fontFamily: FONT_DISPLAY, fontSize: 13, color: C.text },
  tbAccountCell: { flex: 1.6 },
  tbHeaderText: { color: C.mute, fontFamily: FONT_DISPLAY_BOLD, fontSize: 12, letterSpacing: 0.5 },
  tbAmount: { fontFamily: FONT_MONO, fontSize: 13 },
});
