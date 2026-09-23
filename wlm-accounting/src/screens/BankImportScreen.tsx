import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  FileUp,
  X,
} from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import Button from "../components/Button";
import StatTile from "../components/StatTile";
import EmptyState from "../components/EmptyState";
import { useToast } from "../components/Toast";
import { useLedger } from "../lib/LedgerContext";
import {
  ImportCandidate,
  buildCandidates,
  candidateToTxn,
  dateRange,
  parseStatement,
  recipesForLine,
  summariseCandidates,
} from "../lib/bankImport";
import { Account, Txn, accountName } from "../lib/accounting";
import { abs, fmt, fmtDate, fmtDateShort } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";
import * as haptics from "../lib/haptics";

/** Per-line choices the user has overridden, keyed by parsed line id. */
type Overrides = Record<string, { recipeId: string; accountId?: string }>;

export default function BankImportScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const toast = useToast();
  const { accounts, txns, addTxns } = useLedger();

  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ImportCandidate | null>(null);

  const summary = useMemo(
    () => (candidates ? summariseCandidates(candidates) : null),
    [candidates]
  );
  const span = useMemo(
    () => (candidates ? dateRange(candidates.map((c) => c.line)) : null),
    [candidates]
  );

  const choiceFor = useCallback(
    (c: ImportCandidate) => overrides[c.line.id] ?? c.suggestion,
    [overrides]
  );

  const pickFile = async () => {
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/x-ofx", "*/*"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.length) return;

      const asset = picked.assets[0];
      const text = new FileSystem.File(asset.uri).textSync();
      const result = parseStatement(text, asset.name ?? "");

      if (!result.ok) {
        toast.show(result.reason, "error");
        return;
      }
      setCandidates(buildCandidates(result.lines, txns));
      setOverrides({});

      const dupes = result.lines.length - buildCandidates(result.lines, txns).filter((c) => c.selected).length;
      toast.show(
        `${result.lines.length} lines read${dupes > 0 ? ` · ${dupes} already captured` : ""}`
      );
    } catch {
      toast.show("Couldn't read that file", "error");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => {
    haptics.tap();
    setCandidates((prev) =>
      prev?.map((c) => (c.line.id === id ? { ...c, selected: !c.selected } : c)) ?? null
    );
  };

  const setAll = (selected: boolean) => {
    haptics.tap();
    // Duplicates stay off even on "select all" — turning one on has to be a
    // deliberate, per-line act, since that's the path to double-counting.
    setCandidates(
      (prev) =>
        prev?.map((c) => ({ ...c, selected: selected && !c.duplicateOf })) ?? null
    );
  };

  const post = () => {
    if (!candidates || !summary?.selected) return;

    Alert.alert(
      `Post ${summary.selected} transaction${summary.selected === 1 ? "" : "s"}?`,
      `${fmt(summary.moneyIn)} in, ${fmt(summary.moneyOut)} out. Skipped lines aren't recorded and can be imported later.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Post",
          onPress: async () => {
            setBusy(true);
            // Built as one batch and posted once. Adding them one at a time
            // meant each call rebuilt the books from the same snapshot, so only
            // the last line survived while the toast reported the full count.
            const batch = candidates
              .filter((c) => c.selected)
              .map((c) => {
                const choice = choiceFor(c);
                return candidateToTxn(c, choice.recipeId, choice.accountId);
              })
              .filter((t): t is Txn => t !== null);

            await addTxns(batch);
            const posted = batch.length;
            setBusy(false);
            setCandidates(null);
            setOverrides({});
            haptics.success();
            toast.show(`Posted ${posted} transaction${posted === 1 ? "" : "s"}`);
          },
        },
      ]
    );
  };

  if (!candidates) {
    return (
      <View style={styles.screen}>
        <Header title="BANK IMPORT" subtitle="FNB CSV or OFX" onBack={() => nav.goBack()} />
        <EmptyState
          icon={<FileUp color={C.mute} size={28} />}
          title="Import a statement"
          body="Download a CSV or OFX statement from FNB online banking, then pick it here. Every line is shown with a suggested category — nothing posts until you confirm it."
          actionLabel="Choose file"
          onAction={pickFile}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title="REVIEW IMPORT"
        subtitle={
          span ? `${fmtDateShort(span.from)} — ${fmtDateShort(span.to)}` : "Statement"
        }
        onBack={() => {
          setCandidates(null);
          setOverrides({});
        }}
      />

      <View style={styles.top}>
        <View style={styles.stats}>
          <StatTile
            label="MONEY IN"
            value={fmt(summary?.moneyIn ?? 0)}
            color={C.green}
            compact
          />
          <StatTile
            label="MONEY OUT"
            value={fmt(summary?.moneyOut ?? 0)}
            color={C.red}
            compact
          />
        </View>

        <View style={styles.selectRow}>
          <Text style={styles.selectText}>
            {summary?.selected ?? 0} of {summary?.total ?? 0} selected
            {summary?.duplicates ? ` · ${summary.duplicates} already captured` : ""}
          </Text>
          <View style={styles.selectActions}>
            <Pressable onPress={() => setAll(true)} hitSlop={6}>
              <Text style={styles.selectLink}>All</Text>
            </Pressable>
            <Pressable onPress={() => setAll(false)} hitSlop={6}>
              <Text style={styles.selectLink}>None</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <FlatList
        data={candidates}
        keyExtractor={(c) => c.line.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <LineRow
            candidate={item}
            accounts={accounts}
            choice={choiceFor(item)}
            onToggle={() => toggle(item.line.id)}
            onEdit={() => setEditing(item)}
          />
        )}
      />

      <View style={styles.footer}>
        <Button
          label={`Post ${summary?.selected ?? 0} transaction${summary?.selected === 1 ? "" : "s"}`}
          onPress={post}
          loading={busy}
          disabled={!summary?.selected}
          size="lg"
        />
      </View>

      <CategoryPicker
        candidate={editing}
        accounts={accounts}
        current={editing ? choiceFor(editing) : undefined}
        onClose={() => setEditing(null)}
        onPick={(recipeId, accountId) => {
          if (editing) {
            setOverrides((prev) => ({ ...prev, [editing.line.id]: { recipeId, accountId } }));
          }
          setEditing(null);
        }}
      />
    </View>
  );
}

function LineRow({
  candidate,
  accounts,
  choice,
  onToggle,
  onEdit,
}: {
  candidate: ImportCandidate;
  accounts: Account[];
  choice: { recipeId: string; accountId?: string; reason?: string };
  onToggle: () => void;
  onEdit: () => void;
}) {
  const { line, duplicateOf } = candidate;
  const moneyIn = line.amount > 0;
  const Arrow = moneyIn ? ArrowDownLeft : ArrowUpRight;
  const colour = moneyIn ? C.green : C.red;

  const target = choice.accountId
    ? accountName(accounts, choice.accountId)
    : recipeLabel(choice.recipeId);

  return (
    <View style={[styles.row, !candidate.selected && styles.rowOff]}>
      <Pressable onPress={onToggle} hitSlop={8} style={styles.checkWrap}>
        <View style={[styles.check, candidate.selected && styles.checkOn]}>
          {candidate.selected && <Check color={C.bg} size={14} />}
        </View>
      </Pressable>

      <Pressable style={styles.rowBody} onPress={onEdit}>
        <View style={styles.rowHead}>
          <Arrow color={colour} size={14} />
          <Text style={styles.desc} numberOfLines={1}>
            {line.description}
          </Text>
        </View>

        <View style={styles.rowMeta}>
          <Text style={styles.date}>{fmtDate(line.date)}</Text>
          <View style={styles.categoryPill}>
            <Text style={styles.categoryText} numberOfLines={1}>
              {target}
            </Text>
          </View>
        </View>

        {duplicateOf && (
          <View style={styles.dupeRow}>
            <Copy color={C.amber} size={11} />
            <Text style={styles.dupeText}>
              Already captured as "{duplicateOf.desc}" — tick only if it's genuinely separate
            </Text>
          </View>
        )}
      </Pressable>

      <Text style={[styles.amount, { color: colour }]}>
        {moneyIn ? "+" : "−"} {abs(line.amount)}
      </Text>
    </View>
  );
}

function CategoryPicker({
  candidate,
  accounts,
  current,
  onClose,
  onPick,
}: {
  candidate: ImportCandidate | null;
  accounts: Account[];
  current?: { recipeId: string; accountId?: string };
  onClose: () => void;
  onPick: (recipeId: string, accountId?: string) => void;
}) {
  if (!candidate) return null;
  const recipes = recipesForLine(candidate.line);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {candidate.line.description}
            </Text>
            <Text style={styles.sheetSub}>
              {fmtDate(candidate.line.date)} · {fmt(Math.abs(candidate.line.amount))}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <X color={C.mute} size={20} />
          </Pressable>
        </View>

        <FlatList
          data={recipes}
          keyExtractor={(r) => r.id}
          style={styles.sheetList}
          renderItem={({ item: recipe }) => {
            const picks = recipe.pick
              ? accounts.filter((a) => recipe.pickTypes!.includes(a.type))
              : [];

            if (!recipe.pick) {
              const active = current?.recipeId === recipe.id;
              return (
                <Pressable
                  onPress={() => onPick(recipe.id, undefined)}
                  style={[styles.option, active && styles.optionOn]}
                >
                  <Text style={[styles.optionLabel, active && styles.optionLabelOn]}>
                    {recipe.label}
                  </Text>
                  {active && <CheckCircle2 color={C.orange} size={16} />}
                </Pressable>
              );
            }

            return (
              <View style={styles.group}>
                <Text style={styles.groupLabel}>{recipe.label}</Text>
                <View style={styles.chips}>
                  {picks.map((a) => {
                    const active =
                      current?.recipeId === recipe.id && current?.accountId === a.id;
                    return (
                      <Pressable
                        key={a.id}
                        onPress={() => onPick(recipe.id, a.id)}
                        style={[styles.chip, active && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextOn]}>
                          {a.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
}

function recipeLabel(recipeId: string): string {
  switch (recipeId) {
    case "invoice_paid":
      return "Invoice payment";
    case "owner_in":
      return "Owner contribution";
    case "buy_stock":
      return "Stock purchase";
    case "drawings":
      return "Drawings";
    case "sale_cash":
      return "Sale";
    default:
      return "Expense";
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  top: { paddingHorizontal: S.lg, gap: S.md, paddingBottom: S.md },
  stats: { flexDirection: "row", gap: S.md },
  selectRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectText: { ...T.caption, color: C.mute, flex: 1 },
  selectActions: { flexDirection: "row", gap: S.lg },
  selectLink: { ...T.small, color: C.orange },
  list: { paddingHorizontal: S.lg, paddingBottom: S.huge },
  sep: { height: 1, backgroundColor: C.line },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.md },
  rowOff: { opacity: 0.45 },
  checkWrap: { padding: 2 },
  check: {
    width: 22,
    height: 22,
    borderRadius: R.sm,
    borderWidth: 1.5,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: C.orange, borderColor: C.orange },
  rowBody: { flex: 1, gap: 4 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: S.xs + 2 },
  desc: { ...T.bodyBold, color: C.text, flex: 1 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: S.sm },
  date: { ...T.caption, color: C.mute },
  categoryPill: {
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.pill,
    paddingHorizontal: S.sm,
    paddingVertical: 2,
    flexShrink: 1,
  },
  categoryText: { ...T.caption, color: C.orange },
  dupeRow: { flexDirection: "row", alignItems: "center", gap: S.xs, marginTop: 2 },
  dupeText: { ...T.caption, fontSize: 10, color: C.amber, flex: 1 },
  amount: { ...T.amountSm },
  footer: {
    padding: S.lg,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.bg,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    borderTopWidth: 1,
    borderColor: C.line,
    paddingTop: S.lg,
    paddingBottom: S.xxl,
    maxHeight: "72%",
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
  sheetList: { paddingHorizontal: S.lg, paddingTop: S.md },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: S.md,
    paddingHorizontal: S.md,
    borderRadius: R.md,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: S.sm,
  },
  optionOn: { borderColor: C.orange },
  optionLabel: { ...T.body, color: C.textDim },
  optionLabelOn: { color: C.text },
  group: { marginBottom: S.lg },
  groupLabel: { ...T.label, color: C.mute, marginBottom: S.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  chip: {
    paddingVertical: S.sm,
    paddingHorizontal: S.md,
    borderRadius: R.pill,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
  },
  chipOn: { borderColor: C.orange, backgroundColor: C.panel3 },
  chipText: { ...T.small, color: C.mute },
  chipTextOn: { color: C.orange },
});
