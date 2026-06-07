import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Header from "../components/Header";
import Card from "../components/Card";
import ModuleRoadmap from "../components/ModuleRoadmap";
import { useLedger } from "../lib/LedgerContext";
import { computeProfitAndLoss, displayBalance, topExpenses } from "../lib/accounting";
import { fmt } from "../lib/format";
import { C, FONT_DISPLAY, FONT_DISPLAY_BOLD, FONT_MONO } from "../lib/theme";
import { ComingSoonRoute, RootStackParamList } from "../navigation/routes";

export default function HomeScreen() {
  const { accounts, balances } = useLedger();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  function openModule(route: ComingSoonRoute) {
    rootNavigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate(route) ??
      rootNavigation.navigate(route);
  }

  const bankBalance = balances.bank ?? 0;
  const pnl = useMemo(() => computeProfitAndLoss(accounts, balances), [accounts, balances]);
  const top = useMemo(() => topExpenses(accounts, balances), [accounts, balances]);
  const maxExpense = top.length ? top[0].amount : 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header />

      <Card accent="none" style={styles.bankCard}>
        <Text style={styles.label}>BANK BALANCE</Text>
        <Text style={[styles.bankAmount, bankBalance < 0 && { color: C.red }]}>{fmt(bankBalance)}</Text>
      </Card>

      <View style={styles.row}>
        <Card accent="green" style={styles.half}>
          <Text style={styles.label}>INCOME</Text>
          <Text style={[styles.amount, { color: C.green }]}>{fmt(pnl.income)}</Text>
        </Card>
        <Card accent="red" style={styles.half}>
          <Text style={styles.label}>EXPENSES</Text>
          <Text style={[styles.amount, { color: C.red }]}>{fmt(pnl.expenses)}</Text>
        </Card>
      </View>

      <Card accent="orange">
        <Text style={styles.label}>NET PROFIT / (LOSS)</Text>
        <Text style={[styles.amount, { color: pnl.net >= 0 ? C.green : C.red }]}>{fmt(pnl.net)}</Text>
      </Card>

      <Card>
        <Text style={[styles.label, { marginBottom: 12 }]}>TOP EXPENSES</Text>
        {top.length === 0 ? (
          <Text style={styles.muted}>No expenses recorded yet.</Text>
        ) : (
          top.map(({ account, amount }) => {
            const display = displayBalance(account, amount);
            const width = maxExpense > 0 ? Math.max(8, (amount / maxExpense) * 100) : 0;
            return (
              <View key={account.id} style={styles.expenseRow}>
                <Text style={styles.expenseName} numberOfLines={1}>
                  {account.name}
                </Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${width}%` }]} />
                </View>
                <Text style={styles.expenseAmount}>{fmt(display)}</Text>
              </View>
            );
          })
        )}
      </Card>

      <ModuleRoadmap onOpen={openModule} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  bankCard: { alignItems: "flex-start" },
  label: {
    color: C.mute,
    fontFamily: FONT_DISPLAY_BOLD,
    fontSize: 12,
    letterSpacing: 1.5,
  },
  bankAmount: {
    color: C.text,
    fontFamily: FONT_MONO,
    fontSize: 34,
    marginTop: 6,
  },
  amount: {
    fontFamily: FONT_MONO,
    fontSize: 24,
    marginTop: 6,
  },
  row: { flexDirection: "row", gap: 14 },
  half: { flex: 1 },
  muted: { color: C.mute, fontFamily: FONT_DISPLAY, fontSize: 14 },
  expenseRow: { marginBottom: 12 },
  expenseName: {
    color: C.text,
    fontFamily: FONT_DISPLAY,
    fontSize: 14,
    marginBottom: 6,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: C.panel2,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: C.orange,
  },
  expenseAmount: {
    color: C.mute,
    fontFamily: FONT_MONO,
    fontSize: 12,
    marginTop: 4,
  },
});
