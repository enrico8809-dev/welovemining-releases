import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Settings as SettingsIcon, TrendingDown, TrendingUp } from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import StatTile from "../components/StatTile";
import Sparkline from "../components/Sparkline";
import CashFlowChart from "../components/CashFlowChart";
import ExpenseBars from "../components/ExpenseBars";
import SegmentedControl from "../components/SegmentedControl";
import { DashboardSkeleton } from "../components/Skeleton";
import { useLedger } from "../lib/LedgerContext";
import {
  Account,
  bankBalanceSeries,
  computeBalances,
  computeProfitAndLoss,
  filterByPeriod,
  monthlyCashFlow,
  topExpenses,
} from "../lib/accounting";
import { summariseReceivables } from "../lib/invoices";
import { PERIOD_OPTIONS, PeriodId, buildPeriod, describePeriod } from "../lib/period";
import { fmt } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { TabScreenNavigation } from "../navigation/routes";

export default function HomeScreen() {
  const nav = useNavigation<TabScreenNavigation<"Home">>();
  const { loading, accounts, txns, docs, openingBank, balances, settings } = useLedger();
  const [periodId, setPeriodId] = useState<PeriodId>("ytd");

  const period = useMemo(
    () => buildPeriod(periodId, settings.fyStartMonth),
    [periodId, settings.fyStartMonth]
  );

  // The bank balance is a point-in-time figure, so it always reflects every
  // entry ever posted. Income and expenses are flows, so they respect the filter.
  const periodTxns = useMemo(() => filterByPeriod(txns, period), [txns, period]);
  const periodBalances = useMemo(
    () => computeBalances(accounts, periodTxns, 0),
    [accounts, periodTxns]
  );

  const bankBalance = balances.bank ?? 0;
  const pnl = useMemo(
    () => computeProfitAndLoss(accounts, periodBalances),
    [accounts, periodBalances]
  );
  const expenses = useMemo(
    () => topExpenses(accounts, periodBalances),
    [accounts, periodBalances]
  );
  const trend = useMemo(() => bankBalanceSeries(txns, openingBank), [txns, openingBank]);
  const cashFlow = useMemo(() => monthlyCashFlow(txns), [txns]);
  const receivables = useMemo(() => summariseReceivables(docs), [docs]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <Header />
        <DashboardSkeleton />
      </View>
    );
  }

  const openAccount = (account: Account) =>
    nav.navigate("AccountDetail", { accountId: account.id });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={10}
            onPress={() => nav.navigate("Settings")}
            style={styles.settingsBtn}
          >
            <SettingsIcon color={C.mute} size={19} />
          </Pressable>
        }
      />

      <View style={styles.body}>
        <SegmentedControl options={PERIOD_OPTIONS} value={periodId} onChange={setPeriodId} />
        <Text style={styles.periodNote}>{describePeriod(period)}</Text>

        {/* Hero figure — the one number the dashboard leads with. */}
        <Card index={0}>
          <View style={styles.heroRow}>
            <View style={styles.heroMain}>
              <Text style={styles.heroLabel}>BANK BALANCE</Text>
              <Text
                style={[styles.hero, bankBalance < 0 && { color: C.red }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {fmt(bankBalance)}
              </Text>
              <Text style={styles.heroNote}>
                {bankBalance < 0 ? "Overdrawn" : "Across all time"}
              </Text>
            </View>
            <Sparkline
              data={trend}
              color={bankBalance < 0 ? C.red : C.orange}
              width={104}
              height={56}
            />
          </View>
        </Card>

        <View style={styles.row}>
          <StatTile
            label="INCOME"
            value={fmt(pnl.income)}
            color={C.green}
            compact
            delta={{ text: period.label, good: true }}
          />
          <StatTile
            label="EXPENSES"
            value={fmt(pnl.expenses)}
            color={C.red}
            compact
            delta={{ text: period.label, good: false }}
          />
        </View>

        <Card accent="orange" index={1}>
          <View style={styles.netRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>NET PROFIT / (LOSS)</Text>
              <Text style={[styles.net, { color: pnl.net >= 0 ? C.green : C.red }]}>
                {fmt(pnl.net)}
              </Text>
            </View>
            <View style={[styles.netIcon, { borderColor: pnl.net >= 0 ? C.green : C.red }]}>
              {pnl.net >= 0 ? (
                <TrendingUp color={C.green} size={20} />
              ) : (
                <TrendingDown color={C.red} size={20} />
              )}
            </View>
          </View>
        </Card>

        {receivables.unpaidCount > 0 && (
          <Card
            index={2}
            title="AWAITING PAYMENT"
            onPress={() => nav.navigate("Invoices")}
          >
            <Text style={styles.receivable}>{fmt(receivables.outstanding)}</Text>
            <Text style={styles.receivableNote}>
              {receivables.unpaidCount} unpaid invoice
              {receivables.unpaidCount === 1 ? "" : "s"}
              {receivables.overdue > 0 ? ` · ${fmt(receivables.overdue)} overdue` : ""}
            </Text>
          </Card>
        )}

        <Card index={3} title="CASH FLOW · LAST 6 MONTHS">
          <CashFlowChart data={cashFlow} />
        </Card>

        <Card index={4} title="TOP EXPENSES">
          <ExpenseBars data={expenses} onSelect={openAccount} />
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: S.huge },
  body: { paddingHorizontal: S.lg, gap: S.lg },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: R.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
  },
  periodNote: { ...T.caption, color: C.mute, marginTop: -S.sm },
  heroRow: { flexDirection: "row", alignItems: "center", gap: S.md },
  heroMain: { flex: 1 },
  heroLabel: { ...T.label, color: C.mute },
  hero: { ...T.hero, color: C.text, marginTop: S.xs },
  heroNote: { ...T.caption, color: C.mute, marginTop: S.xs },
  row: { flexDirection: "row", gap: S.md },
  netRow: { flexDirection: "row", alignItems: "center", gap: S.md },
  net: { ...T.amountLg, fontSize: 26, marginTop: S.xs },
  netIcon: {
    width: 44,
    height: 44,
    borderRadius: R.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  receivable: { ...T.amountLg, color: C.amber },
  receivableNote: { ...T.small, color: C.mute, marginTop: S.xs },
});
