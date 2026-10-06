import React, { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { Check, Info } from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import Button from "../components/Button";
import Field from "../components/Field";
import CurrencyInput from "../components/CurrencyInput";
import DateField from "../components/DateField";
import SegmentedControl from "../components/SegmentedControl";
import { useToast } from "../components/Toast";
import { useLedger } from "../lib/LedgerContext";
import {
  Account,
  RECIPES,
  Recipe,
  Txn,
  accountName,
  isReasonableDate,
  recipesFor,
} from "../lib/accounting";
import { findAsset, zarForUnits } from "../lib/crypto";
import { abs, fmt, parseAmount, todayISO } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { TabParamList, TabScreenNavigation } from "../navigation/routes";

type AddRoute = RouteProp<TabParamList, "Add">;
type Money = "rands" | "crypto";

const MONEY_KINDS: { id: Money; label: string }[] = [
  { id: "rands", label: "Rands" },
  { id: "crypto", label: "Crypto" },
];

export default function AddScreen() {
  const nav = useNavigation<TabScreenNavigation<"Add">>();
  const route = useRoute<AddRoute>();
  const toast = useToast();
  const { accounts, manualTxns, addTxn, updateTxn, openingBank, setOpeningBank, settings } =
    useLedger();

  const editId = route.params?.editId;
  const editing = useMemo(
    () => (editId ? manualTxns.find((t) => t.id === editId) : undefined),
    [editId, manualTxns]
  );

  const [money, setMoney] = useState<Money>("rands");
  const [recipeId, setRecipeId] = useState(RECIPES[0].id);
  const [pickedAccountId, setPickedAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(todayISO());
  const [errors, setErrors] = useState<{ amount?: string; desc?: string; units?: string }>({});

  // Coins: the units are the fact the owner has in front of them from Binance,
  // and the rand value follows from the rate that day. Both are entered and the
  // rate is shown as what they imply — see lib/crypto for why it isn't stored.
  const [assetSymbol, setAssetSymbol] = useState(settings.crypto.assets[0]?.symbol ?? "");
  const [units, setUnits] = useState("");
  const [zarTouched, setZarTouched] = useState(false);

  const [openingInput, setOpeningInput] = useState(String(openingBank));

  const visibleRecipes = useMemo(() => recipesFor(money), [money]);

  // Load an existing entry when the Ledger sends us here to edit one.
  useEffect(() => {
    if (!editing) return;
    setMoney(editing.crypto ? "crypto" : "rands");
    setRecipeId(editing.recipe);
    const recipe = RECIPES.find((r) => r.id === editing.recipe);
    if (recipe?.pick) {
      setPickedAccountId(recipe.pick === "debit" ? editing.debit : editing.credit);
    }
    setAmount(String(editing.amount));
    setDesc(editing.desc);
    setDate(editing.date);
    if (editing.crypto) {
      setAssetSymbol(editing.crypto.asset);
      setUnits(String(editing.crypto.units));
      // The rand figure is the one that was saved, not one to re-derive from
      // today's rate — the entry happened at the rate it happened at.
      setZarTouched(true);
    }
  }, [editing]);

  const recipe = useMemo<Recipe>(
    () => RECIPES.find((r) => r.id === recipeId) ?? visibleRecipes[0] ?? RECIPES[0],
    [recipeId, visibleRecipes]
  );

  const asset = useMemo(
    () => findAsset(settings.crypto, assetSymbol),
    [settings.crypto, assetSymbol]
  );

  const pickOptions = useMemo<Account[]>(() => {
    if (!recipe.pick || !recipe.pickTypes) return [];
    return accounts.filter((a) => recipe.pickTypes!.includes(a.type));
  }, [recipe, accounts]);

  const resetForm = () => {
    setAmount("");
    setDesc("");
    setDate(todayISO());
    setPickedAccountId(null);
    setUnits("");
    setZarTouched(false);
    setErrors({});
  };

  const selectRecipe = (r: Recipe) => {
    setRecipeId(r.id);
    setPickedAccountId(null);
  };

  const selectMoney = (next: Money) => {
    setMoney(next);
    const first = recipesFor(next)[0];
    if (first) setRecipeId(first.id);
    setPickedAccountId(null);
  };

  /** Typing coins fills the rands in at the stored rate, until that is edited. */
  const changeUnits = (text: string) => {
    setUnits(text);
    const n = parseAmount(text);
    if (zarTouched || !asset || asset.rateZar <= 0) return;
    if (!Number.isFinite(n) || n <= 0) return;
    setAmount(abs(zarForUnits(n, asset.rateZar)));
  };

  const unitsValue = parseAmount(units);
  const amountValue = parseAmount(amount);
  const impliedRate =
    Number.isFinite(unitsValue) && unitsValue > 0 && Number.isFinite(amountValue) && amountValue > 0
      ? amountValue / unitsValue
      : null;

  // The preview is the honest part of this screen: it shows exactly which
  // accounts move, so nothing is booked that the user didn't see first.
  const preview = useMemo(() => {
    const debit = recipe.pick === "debit" ? pickedAccountId ?? recipe.debit : recipe.debit;
    const credit = recipe.pick === "credit" ? pickedAccountId ?? recipe.credit : recipe.credit;
    return { debit, credit };
  }, [recipe, pickedAccountId]);

  const handleSave = () => {
    const next: typeof errors = {};
    const numericAmount = parseAmount(amount);
    const numericUnits = parseAmount(units);
    const isCrypto = !!recipe.crypto;

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      next.amount = isCrypto
        ? "Enter what those coins were worth in rands."
        : "Enter an amount greater than zero.";
    }
    if (isCrypto && (!Number.isFinite(numericUnits) || numericUnits <= 0)) {
      next.units = "Enter how many coins moved.";
    }
    if (!desc.trim()) next.desc = "Give this transaction a description.";
    setErrors(next);

    if (Object.keys(next).length) {
      toast.show("Check the highlighted fields", "error");
      return;
    }
    if (isCrypto && !assetSymbol.trim()) {
      toast.show("Pick which coin this was", "error");
      return;
    }
    if (recipe.pick && !pickedAccountId) {
      toast.show("Pick which account this relates to", "error");
      return;
    }
    if (!isReasonableDate(date)) {
      toast.show("That date doesn't look right", "error");
      return;
    }

    const txn: Txn = {
      id: editing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date,
      desc: desc.trim(),
      amount: numericAmount,
      debit: preview.debit,
      credit: preview.credit,
      recipe: recipe.id,
      ...(isCrypto
        ? { crypto: { asset: assetSymbol.trim().toUpperCase(), units: numericUnits } }
        : {}),
    };

    if (editing) {
      updateTxn(txn);
      toast.show("Transaction updated");
      nav.navigate("Ledger");
    } else {
      addTxn(txn);
      toast.show(`Recorded ${fmt(numericAmount)}`);
    }
    resetForm();
  };

  const handleSaveOpening = () => {
    const numeric = parseAmount(openingInput);
    if (!Number.isFinite(numeric)) {
      toast.show("Opening balance must be a number", "error");
      return;
    }
    setOpeningBank(numeric);
    toast.show("Opening bank balance updated");
  };

  const namedAssets = settings.crypto.assets.filter((a) => !!a.symbol.trim());

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Header
          title={editing ? "EDIT ENTRY" : "ADD ENTRY"}
          subtitle={editing ? "Change and re-save" : "Pick what happened"}
        />

        <View style={styles.body}>
          <SegmentedControl options={MONEY_KINDS} value={money} onChange={selectMoney} />

          <Card index={0} title="WHAT HAPPENED?">
            <View style={styles.options}>
              {visibleRecipes.map((r) => {
                const active = r.id === recipeId;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => selectRecipe(r)}
                    style={[styles.option, active && styles.optionActive]}
                  >
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: r.dir === "in" ? C.green : C.red },
                      ]}
                    />
                    <View style={styles.optionText}>
                      <Text style={[styles.optionLabel, active && styles.optionLabelOn]}>
                        {r.label}
                      </Text>
                      <Text style={styles.optionHint}>{r.hint}</Text>
                    </View>
                    {active && <Check color={C.orange} size={17} />}
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {recipe.pick && (
            <Card
              index={1}
              title={
                recipe.pickTypes?.includes("income")
                  ? "WHICH INCOME ACCOUNT?"
                  : "WHICH EXPENSE ACCOUNT?"
              }
            >
              <View style={styles.chips}>
                {pickOptions.map((a) => {
                  const active = a.id === pickedAccountId;
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => setPickedAccountId(a.id)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>
                        {a.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          )}

          {!!recipe.crypto && (
            <Card index={1} title="WHICH COIN, AND HOW MANY?">
              {namedAssets.length === 0 ? (
                <Text style={styles.note}>
                  No coins are set up yet. Add one under Settings → Crypto first.
                </Text>
              ) : (
                <View style={styles.chips}>
                  {namedAssets.map((a) => {
                    const active = a.symbol === assetSymbol;
                    return (
                      <Pressable
                        key={a.symbol}
                        onPress={() => setAssetSymbol(a.symbol)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>
                          {a.symbol}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <View style={styles.spacer} />
              <Field
                label={`UNITS${assetSymbol ? ` (${assetSymbol})` : ""}`}
                value={units}
                onChangeText={changeUnits}
                placeholder="0.00"
                keyboardType="decimal-pad"
                error={errors.units}
                mono
              />
              <Text style={styles.note}>
                {asset && asset.rateZar > 0
                  ? `Rands filled in at R ${abs(asset.rateZar)} per ${asset.symbol} from Settings. If the rate you actually got was different, change the rand amount below — that is the one the books use.`
                  : "Set a rand rate for this coin in Settings and the rand amount below will fill itself in."}
              </Text>
            </Card>
          )}

          <Card index={2}>
            <Text style={styles.fieldLabel}>
              {recipe.crypto ? "WHAT THAT WAS WORTH IN RANDS" : "AMOUNT"}
            </Text>
            <CurrencyInput
              value={amount}
              onChangeText={(v) => {
                if (recipe.crypto) setZarTouched(true);
                setAmount(v);
              }}
              error={errors.amount}
            />
            {!!recipe.crypto && (
              <Text style={styles.rate}>
                {impliedRate
                  ? `Works out at R ${abs(impliedRate)} per ${assetSymbol || "coin"}`
                  : "The rate follows from the two figures — it isn't entered separately."}
              </Text>
            )}

            <View style={styles.spacer} />
            <Field
              label="DESCRIPTION"
              value={desc}
              onChangeText={setDesc}
              placeholder={
                recipe.crypto
                  ? "e.g. Deposit to supplier for 2 × S21"
                  : "e.g. Antminer S21 sale to J. Smit"
              }
              error={errors.desc}
            />

            <View style={styles.spacer} />
            <DateField label="DATE" value={date} onChange={setDate} />
          </Card>

          {/* Shows the exact double entry before anything is written. */}
          <View style={styles.preview}>
            <Info color={C.mute} size={14} />
            <Text style={styles.previewText}>
              Debit <Text style={styles.previewAccount}>{accountName(accounts, preview.debit)}</Text>
              {"  ·  "}
              Credit{" "}
              <Text style={styles.previewAccount}>{accountName(accounts, preview.credit)}</Text>
            </Text>
          </View>

          {recipe.crypto === "out" && (
            <Text style={styles.footNote}>
              Paying coins out realises whatever the rate has done since they came
              in. The gain or loss against what those coins cost is worked out and
              posted to Crypto Gains / (Losses) on its own — you don't enter it.
            </Text>
          )}

          <Button
            label={editing ? "Save changes" : "Save transaction"}
            onPress={handleSave}
            size="lg"
          />

          {editing && (
            <Button
              label="Cancel edit"
              variant="secondary"
              onPress={() => {
                resetForm();
                nav.navigate("Ledger");
              }}
            />
          )}

          {!editing && money === "rands" && (
            <Card index={3} title="OPENING BANK BALANCE">
              <Text style={styles.noteTop}>
                Set this once. It seeds the FNB account before any transactions are counted.
              </Text>
              <View style={styles.spacer} />
              <CurrencyInput value={openingInput} onChangeText={setOpeningInput} />
              <Text style={styles.current}>Currently {fmt(openingBank)}</Text>
              <Button
                label="Save opening balance"
                variant="ghost"
                onPress={handleSaveOpening}
                style={{ marginTop: S.md }}
              />
            </Card>
          )}

          {!editing && money === "crypto" && (
            <Text style={styles.footNote}>
              Coins already sitting in {settings.crypto.platform || "the exchange"} when
              these books start go in under "Crypto already on hand" — the units
              you held and what they were worth that day.
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: S.huge },
  body: { paddingHorizontal: S.lg, gap: S.lg },
  options: { gap: S.sm },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    paddingVertical: S.md,
    paddingHorizontal: S.md,
    borderRadius: R.md,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
  },
  optionActive: { borderColor: C.orange, backgroundColor: C.panel3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  optionText: { flex: 1 },
  optionLabel: { ...T.body, color: C.textDim },
  optionLabelOn: { color: C.text, fontFamily: T.bodyBold.fontFamily },
  optionHint: { ...T.caption, color: C.mute, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  chip: {
    paddingVertical: S.sm,
    paddingHorizontal: S.md,
    borderRadius: R.pill,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
  },
  chipActive: { borderColor: C.orange, backgroundColor: C.panel3 },
  chipLabel: { ...T.small, color: C.mute },
  chipLabelOn: { color: C.orange },
  fieldLabel: { ...T.label, color: C.mute, marginBottom: S.sm },
  spacer: { height: S.lg },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm,
    paddingHorizontal: S.md,
  },
  previewText: { ...T.small, color: C.mute, flex: 1, lineHeight: 18 },
  previewAccount: { color: C.textDim },
  note: { ...T.small, color: C.mute, lineHeight: 19, marginTop: S.md },
  noteTop: { ...T.small, color: C.mute, lineHeight: 19 },
  rate: { ...T.caption, color: C.mute, marginTop: S.sm },
  current: { ...T.amountSm, color: C.textDim, marginTop: S.md },
  footNote: { ...T.caption, color: C.mute, lineHeight: 17, paddingHorizontal: S.xs },
});
