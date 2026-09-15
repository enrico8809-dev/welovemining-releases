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
import { useToast } from "../components/Toast";
import { useLedger } from "../lib/LedgerContext";
import {
  Account,
  RECIPES,
  Recipe,
  Txn,
  accountName,
  isReasonableDate,
} from "../lib/accounting";
import { fmt, parseAmount, todayISO } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { TabParamList, TabScreenNavigation } from "../navigation/routes";

type AddRoute = RouteProp<TabParamList, "Add">;

export default function AddScreen() {
  const nav = useNavigation<TabScreenNavigation<"Add">>();
  const route = useRoute<AddRoute>();
  const toast = useToast();
  const { accounts, manualTxns, addTxn, updateTxn, openingBank, setOpeningBank } = useLedger();

  const editId = route.params?.editId;
  const editing = useMemo(
    () => (editId ? manualTxns.find((t) => t.id === editId) : undefined),
    [editId, manualTxns]
  );

  const [recipeId, setRecipeId] = useState(RECIPES[0].id);
  const [pickedAccountId, setPickedAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(todayISO());
  const [errors, setErrors] = useState<{ amount?: string; desc?: string }>({});

  const [openingInput, setOpeningInput] = useState(String(openingBank));

  // Load an existing entry when the Ledger sends us here to edit one.
  useEffect(() => {
    if (!editing) return;
    setRecipeId(editing.recipe);
    const recipe = RECIPES.find((r) => r.id === editing.recipe);
    if (recipe?.pick) {
      setPickedAccountId(recipe.pick === "debit" ? editing.debit : editing.credit);
    }
    setAmount(String(editing.amount));
    setDesc(editing.desc);
    setDate(editing.date);
  }, [editing]);

  const recipe = useMemo<Recipe>(
    () => RECIPES.find((r) => r.id === recipeId) ?? RECIPES[0],
    [recipeId]
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
    setErrors({});
  };

  const selectRecipe = (r: Recipe) => {
    setRecipeId(r.id);
    setPickedAccountId(null);
  };

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

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      next.amount = "Enter an amount greater than zero.";
    }
    if (!desc.trim()) next.desc = "Give this transaction a description.";
    setErrors(next);

    if (Object.keys(next).length) {
      toast.show("Check the highlighted fields", "error");
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
          <Card index={0} title="WHAT HAPPENED?">
            <View style={styles.options}>
              {RECIPES.map((r) => {
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

          <Card index={2}>
            <Text style={styles.fieldLabel}>AMOUNT</Text>
            <CurrencyInput value={amount} onChangeText={setAmount} error={errors.amount} />

            <View style={styles.spacer} />
            <Field
              label="DESCRIPTION"
              value={desc}
              onChangeText={setDesc}
              placeholder="e.g. Antminer S21 sale to J. Smit"
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

          {!editing && (
            <Card index={3} title="OPENING BANK BALANCE">
              <Text style={styles.note}>
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
  note: { ...T.small, color: C.mute, lineHeight: 19 },
  current: { ...T.amountSm, color: C.textDim, marginTop: S.md },
});
