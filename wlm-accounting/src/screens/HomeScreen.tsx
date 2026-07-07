import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Landmark, TrendingDown, TrendingUp } from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import ModuleRoadmap from "../components/ModuleRoadmap";
import { Amount, IconBadge, Pill, SectionLabel } from "../components/ui";
import { useLedger } from "../lib/LedgerContext";
import { computeProfitAndLoss, displayBalance, topExpenses } from "../lib/accounting";
import { fmt } from "../lib/format";
import { C, FONT_DISPLAY, FONT_MONO } from "../lib/theme";
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
  const profitable = pnl.net >= 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header />

      {/* Hero — bank balance with net P/L pill */}
      <Card raised accent="orange" style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroLabelRow}>
            <IconBadge tint={C.orangeSoft} size={30}>
              <Landmark color={C.orange} size={16} />
            </IconBadge>
            <SectionLabel>BANK BALANCE</SectionLabel>
          </View>
          <Pill
            label={`${profitable ? "▲" : "▼"} ${fmt(pnl.net)}`}
            color={profitable ? C.green : C.red}
            bg={profitable ? C.greenSoft : C.redSoft}
          />
        </View>
        <Amount value={bankBalance} size={40} style={styles.heroAmount} />
        <Text style={styles.heroSub}>FNB Business · net profit / (loss) to date</Text>
      </Card>

      {/* Money in / out tiles */}
      <View style={styles.row}>
        <Card style={styles.half}>
          <View style={styles.tileHead}>
            <IconBadge tint={C.greenSoft} size={32}>
              <TrendingUp color={C.green} size={17} />
            </IconBadge>
            <SectionLabel>INCOME</SectionLabel>
          </View>
          <Amount value={pnl.income} size={22} color={C.green} style={styles.tileAmount} />
        </Card>
        <Card style={styles.half}>
          <View style={styles.tileHead}>
            <IconBadge tint={C.redSoft} size={32}>
              <TrendingDown color={C.red} size={17} />
            </IconBadge>
            <SectionLabel>EXPENSES</SectionLabel>
          </View>
          <Amount value={pnl.expenses} size={22} color={C.red} style={styles.tileAmount} />
        </Card>
      </View>

      {/* Top expenses */}
      <Card>
        <SectionLabel style={{ marginBottom: 14 }}>TOP EXPENSES</SectionLabel>
        {top.length === 0 ? (
          <Text style={styles.muted}>No expenses recorded yet.</Text>
        ) : (
          top.map(({ account, amount }, i) => {
            const display = displayBalance(account, amount);
            const width = maxExpense > 0 ? Math.max(6, (amount / maxExpense) * 100) : 0;
            return (
              <View key={account.id} style={[styles.expenseRow, i === top.length - 1 && { marginBottom: 0 }]}>
                <View style={styles.expenseTop}>
                  <Text style={styles.expenseName} numberOfLines={1}>
                    {account.name}
                  </Text>
                  <Text style={styles.expenseAmount}>{fmt(display)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${width}%` }]} />
                </View>
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
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  hero: { paddingVertical: 20 },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroLabelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroAmount: { marginTop: 14 },
  heroSub: { color: C.mute, fontFamily: FONT_MONO, fontSize: 11, marginTop: 8, letterSpacing: 0.4 },
  row: { flexDirection: "row", gap: 14 },
  half: { flex: 1 },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  tileAmount: { marginTop: 12 },
  muted: { color: C.mute, fontFamily: FONT_DISPLAY, fontSize: 14 },
  expenseRow: { marginBottom: 14 },
  expenseTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 7,
    gap: 10,
  },
  expenseName: { flex: 1, color: C.text, fontFamily: FONT_DISPLAY, fontSize: 14 },
  expenseAmount: { color: C.mute, fontFamily: FONT_MONO, fontSize: 12 },
  barTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: C.panel2,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: C.orange,
  },
});
