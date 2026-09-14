import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { CheckCircle2, ChevronRight, AlertTriangle, Share2 } from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import Button from "../components/Button";
import SegmentedControl from "../components/SegmentedControl";
import { useToast } from "../components/Toast";
import {
  buildReportHtml,
  profitAndLossHtml,
  sharePdf,
  trialBalanceHtml,
} from "../lib/pdf";
import { useLedger } from "../lib/LedgerContext";
import {
  Account,
  computeBalances,
  computeProfitAndLoss,
  computeTrialBalance,
  filterByPeriod,
} from "../lib/accounting";
import { PERIOD_OPTIONS, PeriodId, buildPeriod, describePeriod } from "../lib/period";
import { abs, fmt } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { TabScreenNavigation } from "../navigation/routes";

export default function ReportsScreen() {
  const nav = useNavigation<TabScreenNavigation<"Reports">>();
  const toast = useToast();
  const { accounts, txns, openingBank, settings } = useLedger();
  const [periodId, setPeriodId] = useState<PeriodId>("ytd");
  const [sharing, setSharing] = useState<"pnl" | "tb" | null>(null);

  const period = useMemo(
    () => buildPeriod(periodId, settings.fyStartMonth),
    [periodId, settings.fyStartMonth]
  );

  const periodTxns = useMemo(() => filterByPeriod(txns, period), [txns, period]);

  // P&L covers the selected period only; the trial balance is a snapshot of the
  // whole book, which is the only way its two columns can be expected to agree.
  const pnl = useMemo(
    () => computeProfitAndLoss(accounts, computeBalances(accounts, periodTxns, 0)),
    [accounts, periodTxns]
  );
  const trial = useMemo(
    () => computeTrialBalance(accounts, computeBalances(accounts, txns, openingBank)),
    [accounts, txns, openingBank]
  );

  const openAccount = (account: Account) =>
    nav.navigate("AccountDetail", { accountId: account.id });

  const exportPnl = async () => {
    setSharing("pnl");
    try {
      const html = buildReportHtml(
        "Profit & Loss",
        describePeriod(period),
        settings,
        profitAndLossHtml(pnl)
      );
      await sharePdf(html, "profit-and-loss.pdf");
    } catch {
      toast.show("Couldn't generate the PDF", "error");
    } finally {
      setSharing(null);
    }
  };

  const exportTrialBalance = async () => {
    setSharing("tb");
    try {
      const html = buildReportHtml(
        "Trial Balance",
        "All time",
        settings,
        trialBalanceHtml(trial.rows, trial.totalDebit, trial.totalCredit)
      );
      await sharePdf(html, "trial-balance.pdf");
    } catch {
      toast.show("Couldn't generate the PDF", "error");
    } finally {
      setSharing(null);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header title="REPORTS" subtitle={describePeriod(period)} />

      <View style={styles.body}>
        <SegmentedControl options={PERIOD_OPTIONS} value={periodId} onChange={setPeriodId} />

        <Card index={0} title="PROFIT & LOSS">
          <Section label="Income" total={pnl.income} color={C.green}>
            {pnl.incomeLines.map((l) => (
              <LineRow
                key={l.account.id}
                name={l.account.name}
                amount={l.amount}
                onPress={() => openAccount(l.account)}
              />
            ))}
          </Section>

          <Section label="Expenses" total={pnl.expenses} color={C.red}>
            {pnl.expenseLines.map((l) => (
              <LineRow
                key={l.account.id}
                name={l.account.name}
                amount={l.amount}
                onPress={() => openAccount(l.account)}
              />
            ))}
          </Section>

          <View style={styles.netRow}>
            <Text style={styles.netLabel}>Net {pnl.net >= 0 ? "profit" : "loss"}</Text>
            <Text style={[styles.netValue, { color: pnl.net >= 0 ? C.green : C.red }]}>
              {fmt(pnl.net)}
            </Text>
          </View>

          <Button
            label="Export as PDF"
            variant="secondary"
            onPress={exportPnl}
            loading={sharing === "pnl"}
            icon={<Share2 color={C.text} size={16} />}
            style={{ marginTop: S.lg }}
          />
        </Card>

        <Card
          index={1}
          title="TRIAL BALANCE"
          action={
            <View style={[styles.badge, { borderColor: trial.balanced ? C.green : C.red }]}>
              {trial.balanced ? (
                <CheckCircle2 color={C.green} size={12} />
              ) : (
                <AlertTriangle color={C.red} size={12} />
              )}
              <Text style={[styles.badgeText, { color: trial.balanced ? C.green : C.red }]}>
                {trial.balanced ? "BALANCED" : "OUT OF BALANCE"}
              </Text>
            </View>
          }
        >
          <Text style={styles.tbNote}>All time · every account with a movement</Text>

          <View style={[styles.tbRow, styles.tbHead]}>
            <Text style={[styles.tbCell, styles.tbAccount, styles.tbHeadText]}>Account</Text>
            <Text style={[styles.tbCell, styles.tbHeadText, styles.right]}>Debit</Text>
            <Text style={[styles.tbCell, styles.tbHeadText, styles.right]}>Credit</Text>
          </View>

          {trial.rows.map((row) => (
            <Pressable
              key={row.account.id}
              onPress={() => openAccount(row.account)}
              style={({ pressed }) => [styles.tbRow, pressed && styles.pressed]}
            >
              <Text style={[styles.tbCell, styles.tbAccount]} numberOfLines={1}>
                {row.account.name}
              </Text>
              <Text style={[styles.tbCell, styles.tbAmount, styles.right]}>
                {row.debit > 0 ? abs(row.debit) : "—"}
              </Text>
              <Text style={[styles.tbCell, styles.tbAmount, styles.right]}>
                {row.credit > 0 ? abs(row.credit) : "—"}
              </Text>
            </Pressable>
          ))}

          <View style={[styles.tbRow, styles.tbTotal]}>
            <Text style={[styles.tbCell, styles.tbAccount, styles.tbHeadText]}>Total</Text>
            <Text style={[styles.tbCell, styles.tbAmount, styles.tbTotalText, styles.right]}>
              {abs(trial.totalDebit)}
            </Text>
            <Text style={[styles.tbCell, styles.tbAmount, styles.tbTotalText, styles.right]}>
              {abs(trial.totalCredit)}
            </Text>
          </View>

          <Text style={styles.tbFoot}>
            Every entry posts an equal debit and credit, so these two columns can never
            disagree.
          </Text>

          <Button
            label="Export as PDF"
            variant="secondary"
            onPress={exportTrialBalance}
            loading={sharing === "tb"}
            icon={<Share2 color={C.text} size={16} />}
            style={{ marginTop: S.lg }}
          />
        </Card>
      </View>
    </ScrollView>
  );
}

function Section({
  label,
  total,
  color,
  children,
}: {
  label: string;
  total: number;
  color: string;
  children: React.ReactNode;
}) {
  const empty = React.Children.count(children) === 0;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>{label}</Text>
        <Text style={[styles.sectionTotal, { color }]}>{fmt(total)}</Text>
      </View>
      {empty ? <Text style={styles.none}>Nothing in this period.</Text> : children}
    </View>
  );
}

function LineRow({
  name,
  amount,
  onPress,
}: {
  name: string;
  amount: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.line, pressed && styles.pressed]}>
      <Text style={styles.lineName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.lineAmount}>{abs(amount)}</Text>
      <ChevronRight color={C.mute} size={14} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: S.huge },
  body: { paddingHorizontal: S.lg, gap: S.lg },
  section: { marginBottom: S.lg },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: S.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    marginBottom: S.sm,
  },
  sectionLabel: { ...T.bodyBold, color: C.text },
  sectionTotal: { ...T.amount },
  none: { ...T.small, color: C.mute, paddingVertical: S.xs },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm,
    paddingVertical: S.sm,
    borderRadius: R.sm,
  },
  pressed: { backgroundColor: C.panel2 },
  lineName: { ...T.small, color: C.textDim, flex: 1 },
  lineAmount: { ...T.amountSm, color: C.text },
  netRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: C.lineStrong,
    paddingTop: S.md,
  },
  netLabel: { ...T.heading, color: C.text },
  netValue: { ...T.amountLg },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.xs,
    borderWidth: 1,
    borderRadius: R.pill,
    paddingHorizontal: S.sm,
    paddingVertical: 3,
  },
  badgeText: { ...T.label, fontSize: 9 },
  tbNote: { ...T.caption, color: C.mute, marginBottom: S.md },
  tbRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: S.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  tbHead: { borderBottomColor: C.lineStrong },
  tbTotal: { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: C.lineStrong },
  tbCell: { flex: 1, ...T.small, color: C.textDim },
  tbAccount: { flex: 1.7, color: C.text },
  tbAmount: { ...T.amountSm, color: C.text },
  tbHeadText: { ...T.label, color: C.mute },
  tbTotalText: { color: C.text },
  right: { textAlign: "right" },
  tbFoot: { ...T.caption, color: C.mute, marginTop: S.md, lineHeight: 16 },
});
