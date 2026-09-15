import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  FileUp,
  Link2,
  Scale,
  Unlink,
  X,
} from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import Button from "../components/Button";
import SegmentedControl from "../components/SegmentedControl";
import EmptyState from "../components/EmptyState";
import { useToast } from "../components/Toast";
import { useLedger } from "../lib/LedgerContext";
import { parseStatement, ParsedLine } from "../lib/bankImport";
import {
  MatchPair,
  ReconcileResult,
  applyManualMatch,
  buildReconciliation,
  closingBalanceFromStatement,
  reconcile,
  reconciledToDate,
  reconciledTxnIds,
  summariseReconciliation,
  unmatch,
} from "../lib/reconcile";
import { Txn, accountName, counterAccountId, isMoneyIn } from "../lib/accounting";
import { abs, fmt, fmtDate, fmtDateShort, parseAmount } from "../lib/format";
import CurrencyInput from "../components/CurrencyInput";
import { C, R, S, T } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";
import * as haptics from "../lib/haptics";

type Tab = "unmatched" | "matched";

const TABS: { id: Tab; label: string }[] = [
  { id: "unmatched", label: "Needs attention" },
  { id: "matched", label: "Matched" },
];

/** One list, three row shapes — discriminated so the renderer stays exhaustive. */
type RecRow =
  | { kind: "statement"; line: ParsedLine }
  | { kind: "books"; txn: Txn }
  | { kind: "matched"; pair: MatchPair };

export default function ReconciliationScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const toast = useToast();
  const { accounts, txns, balances, reconciliations, addReconciliation } = useLedger();

  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [statementDate, setStatementDate] = useState("");
  const [closingInput, setClosingInput] = useState("");
  const [tab, setTab] = useState<Tab>("unmatched");
  const [busy, setBusy] = useState(false);
  const [matchingLine, setMatchingLine] = useState<ParsedLine | null>(null);

  const cleared = useMemo(() => reconciledTxnIds(reconciliations), [reconciliations]);
  const lastReconciled = useMemo(() => reconciledToDate(reconciliations), [reconciliations]);

  const summary = useMemo(() => {
    if (!result) return null;
    const closing = parseAmount(closingInput);
    return summariseReconciliation(
      result,
      Number.isFinite(closing) ? closing : 0,
      balances.bank ?? 0
    );
  }, [result, closingInput, balances.bank]);

  const pickStatement = async () => {
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/x-ofx", "*/*"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.length) return;

      const asset = picked.assets[0];
      const text = new FileSystem.File(asset.uri).textSync();
      const parsed = parseStatement(text, asset.name ?? "");
      if (!parsed.ok) {
        toast.show(parsed.reason, "error");
        return;
      }

      const matched = reconcile(parsed.lines, txns, cleared);
      setResult(matched);

      const dates = parsed.lines.map((l) => l.date).sort();
      setStatementDate(dates[dates.length - 1]);

      const closing = closingBalanceFromStatement(parsed.lines);
      setClosingInput(closing !== null ? String(closing) : "");

      toast.show(
        `${matched.matched.length} matched · ${matched.statementOnly.length + matched.booksOnly.length} need attention`
      );
    } catch {
      toast.show("Couldn't read that file", "error");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!result || !summary) return;
    addReconciliation(buildReconciliation(result, summary, statementDate));
    haptics.success();
    toast.show(
      summary.balanced
        ? `Reconciled to ${fmtDateShort(statementDate)}`
        : `Saved with a ${fmt(Math.abs(summary.difference))} difference`
    );
    setResult(null);
  };

  if (!result) {
    return (
      <View style={styles.screen}>
        <Header
          title="RECONCILIATION"
          subtitle={
            lastReconciled ? `Reconciled to ${fmtDate(lastReconciled)}` : "Not yet reconciled"
          }
          onBack={() => nav.goBack()}
        />
        <EmptyState
          icon={<Scale color={C.mute} size={28} />}
          title="Prove the books against the bank"
          body="Load the same statement you'd import, and every line is matched against what you've recorded. What's left over is exactly what needs your attention — a fee you never captured, or a payment the bank hasn't taken yet."
          actionLabel="Choose statement"
          onAction={pickStatement}
        />
        {reconciliations.length > 0 && (
          <View style={styles.history}>
            <Text style={styles.historyLabel}>PAST RECONCILIATIONS</Text>
            {reconciliations.slice(0, 5).map((r) => (
              <View key={r.id} style={styles.historyRow}>
                {Math.abs(r.difference) < 0.005 ? (
                  <CheckCircle2 color={C.green} size={14} />
                ) : (
                  <AlertTriangle color={C.amber} size={14} />
                )}
                <Text style={styles.historyDate}>{fmtDate(r.statementDate)}</Text>
                <Text style={styles.historyValue}>{fmt(r.closingBalance)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  const rows: RecRow[] =
    tab === "unmatched"
      ? [
          ...result.statementOnly.map((line): RecRow => ({ kind: "statement", line })),
          ...result.booksOnly.map((txn): RecRow => ({ kind: "books", txn })),
        ]
      : result.matched.map((pair): RecRow => ({ kind: "matched", pair }));

  return (
    <View style={styles.screen}>
      <Header
        title="RECONCILE"
        subtitle={statementDate ? `To ${fmtDate(statementDate)}` : "Statement"}
        onBack={() => setResult(null)}
      />

      <FlatList
        data={rows}
        keyExtractor={(row, i) =>
          row.kind === "statement"
            ? `l-${row.line.id}`
            : row.kind === "books"
              ? `t-${row.txn.id}`
              : `m-${row.pair.line.id}-${i}`
        }
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.top}>
            <Card index={0} title="RECONCILIATION" accent={summary?.balanced ? "green" : "orange"}>
              <Row label="Balance per bank statement" value={fmt(summary?.statementClosing ?? 0)} />
              <Row
                label="Add: deposits not yet on statement"
                value={fmt(summary?.depositsInTransit ?? 0)}
                muted
              />
              <Row
                label="Less: payments not yet presented"
                value={`(${abs(summary?.unpresentedPayments ?? 0)})`}
                muted
              />
              <View style={styles.divider} />
              <Row label="Adjusted bank balance" value={fmt(summary?.adjustedBankBalance ?? 0)} strong />
              <Row label="Balance per books" value={fmt(summary?.bookBalance ?? 0)} strong />
              <View style={styles.divider} />
              <Row
                label="Difference"
                value={fmt(summary?.difference ?? 0)}
                strong
                colour={summary?.balanced ? C.green : C.red}
              />

              {summary && !summary.balanced && summary.unrecordedCount > 0 && (
                <Text style={styles.hint}>
                  {summary.unrecordedCount} line{summary.unrecordedCount === 1 ? "" : "s"} on the
                  statement {summary.unrecordedCount === 1 ? "isn't" : "aren't"} in your books yet.
                  Capture {summary.unrecordedCount === 1 ? "it" : "them"} and this should come to zero.
                </Text>
              )}
              {summary?.balanced && (
                <Text style={styles.hintGood}>
                  The books agree with the bank. Every difference is explained by timing.
                </Text>
              )}

              <Text style={styles.closingLabel}>CLOSING BALANCE PER STATEMENT</Text>
              <CurrencyInput value={closingInput} onChangeText={setClosingInput} />
            </Card>

            <View style={styles.tabs}>
              <SegmentedControl options={TABS} value={tab} onChange={setTab} />
            </View>
          </View>
        }
        renderItem={({ item: row }) => {
          if (row.kind === "matched") {
            return (
              <MatchedRow
                pair={row.pair}
                onUnmatch={() => {
                  haptics.tap();
                  setResult(unmatch(result, row.pair.line.id));
                }}
              />
            );
          }
          if (row.kind === "statement") {
            return (
              <StatementOnlyRow
                line={row.line}
                onMatch={() => setMatchingLine(row.line)}
                canMatch={result.booksOnly.length > 0}
              />
            );
          }
          return <BooksOnlyRow txn={row.txn} accounts={accounts} />;
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {tab === "unmatched"
              ? "Nothing needs attention — every line is matched."
              : "Nothing matched yet."}
          </Text>
        }
      />

      <View style={styles.footer}>
        {result.statementOnly.length > 0 && (
          <Button
            label={`Capture ${result.statementOnly.length} missing line${result.statementOnly.length === 1 ? "" : "s"}`}
            variant="secondary"
            onPress={() => nav.navigate("BankImport")}
            icon={<FileUp color={C.text} size={16} />}
            style={{ marginBottom: S.sm }}
          />
        )}
        <Button
          label={summary?.balanced ? "Save reconciliation" : "Save with difference"}
          onPress={save}
          loading={busy}
          size="lg"
        />
      </View>

      <MatchPicker
        line={matchingLine}
        candidates={result.booksOnly}
        accounts={accounts}
        onClose={() => setMatchingLine(null)}
        onPick={(txnId) => {
          if (matchingLine) {
            setResult(applyManualMatch(result, matchingLine.id, txnId));
            haptics.success();
          }
          setMatchingLine(null);
        }}
      />
    </View>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
  colour,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  colour?: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, strong && styles.summaryLabelStrong]}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          strong && styles.summaryValueStrong,
          muted && { color: C.mute },
          colour ? { color: colour } : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function StatementOnlyRow({
  line,
  onMatch,
  canMatch,
}: {
  line: ParsedLine;
  onMatch: () => void;
  canMatch: boolean;
}) {
  const moneyIn = line.amount > 0;
  return (
    <View style={styles.row}>
      <View style={[styles.tag, { borderColor: C.amber }]}>
        <Text style={[styles.tagText, { color: C.amber }]}>BANK</Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.desc} numberOfLines={1}>
          {line.description}
        </Text>
        <Text style={styles.meta}>
          {fmtDate(line.date)} · not in your books
        </Text>
      </View>
      <Text style={[styles.amount, { color: moneyIn ? C.green : C.red }]}>
        {moneyIn ? "+" : "−"} {abs(line.amount)}
      </Text>
      {canMatch && (
        <Pressable onPress={onMatch} hitSlop={8} style={styles.action}>
          <Link2 color={C.orange} size={16} />
        </Pressable>
      )}
    </View>
  );
}

function BooksOnlyRow({ txn, accounts }: { txn: Txn; accounts: { id: string; name: string }[] }) {
  const moneyIn = isMoneyIn(txn);
  return (
    <View style={styles.row}>
      <View style={[styles.tag, { borderColor: C.orange }]}>
        <Text style={[styles.tagText, { color: C.orange }]}>BOOKS</Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.desc} numberOfLines={1}>
          {txn.desc}
        </Text>
        <Text style={styles.meta}>
          {fmtDate(txn.date)} · {accountName(accounts as never, counterAccountId(txn))} ·{" "}
          {moneyIn ? "not yet on statement" : "not yet presented"}
        </Text>
      </View>
      <Text style={[styles.amount, { color: moneyIn ? C.green : C.red }]}>
        {moneyIn ? "+" : "−"} {abs(txn.amount)}
      </Text>
    </View>
  );
}

function MatchedRow({ pair, onUnmatch }: { pair: MatchPair; onUnmatch: () => void }) {
  const moneyIn = pair.line.amount > 0;
  const Arrow = moneyIn ? ArrowDownLeft : ArrowUpRight;
  return (
    <View style={styles.row}>
      <CheckCircle2 color={C.green} size={18} />
      <View style={styles.rowMain}>
        <View style={styles.rowHead}>
          <Arrow color={moneyIn ? C.green : C.red} size={13} />
          <Text style={styles.desc} numberOfLines={1}>
            {pair.line.description}
          </Text>
        </View>
        <Text style={styles.meta}>
          {fmtDate(pair.line.date)} ·{" "}
          {pair.confidence === "exact"
            ? "exact match"
            : pair.confidence === "manual"
              ? "matched by you"
              : `${pair.dayGap} day${pair.dayGap === 1 ? "" : "s"} apart`}
        </Text>
      </View>
      <Text style={[styles.amount, { color: moneyIn ? C.green : C.red }]}>
        {abs(pair.line.amount)}
      </Text>
      <Pressable onPress={onUnmatch} hitSlop={8} style={styles.action}>
        <Unlink color={C.mute} size={15} />
      </Pressable>
    </View>
  );
}

function MatchPicker({
  line,
  candidates,
  accounts,
  onClose,
  onPick,
}: {
  line: ParsedLine | null;
  candidates: Txn[];
  accounts: { id: string; name: string }[];
  onClose: () => void;
  onPick: (txnId: string) => void;
}) {
  if (!line) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              Match "{line.description}"
            </Text>
            <Text style={styles.sheetSub}>
              {fmtDate(line.date)} · {fmt(Math.abs(line.amount))}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <X color={C.mute} size={20} />
          </Pressable>
        </View>

        <FlatList
          data={candidates}
          keyExtractor={(t) => t.id}
          style={styles.sheetList}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => {
            const sameSize = Math.abs(item.amount - Math.abs(line.amount)) < 0.005;
            return (
              <Pressable onPress={() => onPick(item.id)} style={styles.candidate}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.desc} numberOfLines={1}>
                    {item.desc}
                  </Text>
                  <Text style={styles.meta}>
                    {fmtDate(item.date)}
                    {sameSize ? " · same amount" : " · different amount"}
                  </Text>
                </View>
                <Text style={[styles.amount, sameSize && { color: C.green }]}>
                  {abs(item.amount)}
                </Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>Nothing in the books left to match against.</Text>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  top: { gap: S.lg, paddingBottom: S.md },
  tabs: { paddingTop: S.xs },
  list: { paddingHorizontal: S.lg, paddingBottom: S.huge },
  sep: { height: 1, backgroundColor: C.line },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, gap: S.md },
  summaryLabel: { ...T.small, color: C.mute, flex: 1 },
  summaryLabelStrong: { color: C.text, fontFamily: T.bodyBold.fontFamily },
  summaryValue: { ...T.amountSm, color: C.textDim },
  summaryValueStrong: { ...T.amount, color: C.text },
  divider: { height: 1, backgroundColor: C.line, marginVertical: S.sm },
  hint: { ...T.caption, color: C.amber, marginTop: S.md, lineHeight: 16 },
  hintGood: { ...T.caption, color: C.green, marginTop: S.md, lineHeight: 16 },
  closingLabel: { ...T.label, color: C.mute, marginTop: S.lg, marginBottom: S.sm },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.md },
  rowMain: { flex: 1 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: S.xs + 2 },
  tag: {
    borderWidth: 1,
    borderRadius: R.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  tagText: { ...T.label, fontSize: 8 },
  desc: { ...T.bodyBold, color: C.text },
  meta: { ...T.caption, color: C.mute, marginTop: 3 },
  amount: { ...T.amountSm, color: C.text },
  action: { padding: 4 },
  empty: { ...T.small, color: C.mute, textAlign: "center", paddingVertical: S.xxl },
  footer: {
    padding: S.lg,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.bg,
  },
  history: { paddingHorizontal: S.lg, paddingBottom: S.xl },
  historyLabel: { ...T.label, color: C.mute, marginBottom: S.md },
  historyRow: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: S.sm },
  historyDate: { ...T.small, color: C.text, flex: 1 },
  historyValue: { ...T.amountSm, color: C.textDim },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    borderTopWidth: 1,
    borderColor: C.line,
    paddingTop: S.lg,
    paddingBottom: S.xxl,
    maxHeight: "70%",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: S.md,
    paddingHorizontal: S.lg,
    paddingBottom: S.md,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  sheetTitle: { ...T.bodyBold, color: C.text },
  sheetSub: { ...T.caption, color: C.mute, marginTop: 2 },
  sheetList: { paddingHorizontal: S.lg },
  candidate: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.md },
});
