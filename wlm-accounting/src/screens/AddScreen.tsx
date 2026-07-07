import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Check } from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import { GhostButton, PrimaryButton, SectionLabel } from "../components/ui";
import { useLedger } from "../lib/LedgerContext";
import { Account, RECIPES, Recipe, Txn } from "../lib/accounting";
import { fmt } from "../lib/format";
import { C, FONT_DISPLAY, FONT_MONO, R } from "../lib/theme";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AddScreen() {
  const { accounts, openingBank, addTxn, setOpeningBank } = useLedger();

  const [recipeId, setRecipeId] = useState<string>(RECIPES[0].id);
  const [pickedAccountId, setPickedAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(todayISO());
  const [focused, setFocused] = useState<string | null>(null);

  const [openingInput, setOpeningInput] = useState(String(openingBank));

  const recipe = useMemo<Recipe>(() => RECIPES.find((r) => r.id === recipeId) ?? RECIPES[0], [recipeId]);

  const pickOptions = useMemo<Account[]>(() => {
    if (!recipe.pick || !recipe.pickTypes) return [];
    return accounts.filter((a) => recipe.pickTypes!.includes(a.type));
  }, [recipe, accounts]);

  function selectRecipe(r: Recipe) {
    setRecipeId(r.id);
    setPickedAccountId(null);
  }

  function resetForm() {
    setAmount("");
    setDesc("");
    setDate(todayISO());
    setPickedAccountId(null);
  }

  function handleSave() {
    const numericAmount = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert("Enter a valid amount", "Amount must be a positive number.");
      return;
    }
    if (!desc.trim()) {
      Alert.alert("Enter a description", "Please describe this transaction.");
      return;
    }
    if (recipe.pick && !pickedAccountId) {
      Alert.alert("Pick an account", "Please choose which account this relates to.");
      return;
    }

    const debit = recipe.pick === "debit" ? pickedAccountId! : recipe.debit;
    const credit = recipe.pick === "credit" ? pickedAccountId! : recipe.credit;

    const txn: Txn = {
      id: genId(),
      date,
      desc: desc.trim(),
      amount: numericAmount,
      debit,
      credit,
      recipe: recipe.id,
    };

    addTxn(txn);
    resetForm();
    Alert.alert("Saved", "Transaction recorded.");
  }

  function handleSaveOpening() {
    const numeric = Number(openingInput.replace(/,/g, ""));
    if (!Number.isFinite(numeric)) {
      Alert.alert("Enter a valid amount", "Opening balance must be a number.");
      return;
    }
    setOpeningBank(numeric);
    Alert.alert("Saved", "Opening bank balance updated.");
  }

  function inputStyle(key: string) {
    return [styles.input, focused === key && styles.inputFocused];
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header subtitle="New transaction" />

      <Card>
        <SectionLabel style={{ marginBottom: 12 }}>WHAT HAPPENED?</SectionLabel>
        <View style={styles.optionList}>
          {RECIPES.map((r) => {
            const active = r.id === recipeId;
            return (
              <Pressable
                key={r.id}
                onPress={() => selectRecipe(r)}
                style={[styles.option, active && styles.optionActive]}
              >
                <View style={[styles.dot, { backgroundColor: r.dir === "in" ? C.green : C.red }]} />
                <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{r.label}</Text>
                {active ? <Check color={C.orange} size={17} strokeWidth={2.5} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Card>

      {recipe.pick && (
        <Card>
          <SectionLabel style={{ marginBottom: 12 }}>
            {recipe.pickTypes?.includes("income") ? "WHICH INCOME ACCOUNT?" : "WHICH EXPENSE ACCOUNT?"}
          </SectionLabel>
          <View style={styles.chipWrap}>
            {pickOptions.map((a) => {
              const active = a.id === pickedAccountId;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => setPickedAccountId(a.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{a.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      )}

      <Card>
        <SectionLabel style={{ marginBottom: 10 }}>AMOUNT (ZAR)</SectionLabel>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          onFocus={() => setFocused("amount")}
          onBlur={() => setFocused(null)}
          placeholder="0.00"
          placeholderTextColor={C.mute}
          keyboardType="decimal-pad"
          style={[...inputStyle("amount"), styles.amountInput]}
        />

        <SectionLabel style={{ marginTop: 16, marginBottom: 10 }}>DESCRIPTION</SectionLabel>
        <TextInput
          value={desc}
          onChangeText={setDesc}
          onFocus={() => setFocused("desc")}
          onBlur={() => setFocused(null)}
          placeholder="e.g. Antminer S21 sale to J. Smit"
          placeholderTextColor={C.mute}
          style={inputStyle("desc")}
        />

        <SectionLabel style={{ marginTop: 16, marginBottom: 10 }}>DATE (YYYY-MM-DD)</SectionLabel>
        <TextInput
          value={date}
          onChangeText={setDate}
          onFocus={() => setFocused("date")}
          onBlur={() => setFocused(null)}
          placeholder={todayISO()}
          placeholderTextColor={C.mute}
          style={inputStyle("date")}
        />
      </Card>

      <PrimaryButton label="Save transaction" onPress={handleSave} />

      <Card>
        <SectionLabel style={{ marginBottom: 8 }}>OPENING BANK BALANCE</SectionLabel>
        <Text style={styles.muted}>Set once — seeds the FNB Bank Account before any transactions.</Text>
        <TextInput
          value={openingInput}
          onChangeText={setOpeningInput}
          onFocus={() => setFocused("opening")}
          onBlur={() => setFocused(null)}
          placeholder="0.00"
          placeholderTextColor={C.mute}
          keyboardType="decimal-pad"
          style={[...inputStyle("opening"), { marginTop: 12 }]}
        />
        <Text style={styles.currentValue}>Current: {fmt(openingBank)}</Text>
        <GhostButton label="Save opening balance" onPress={handleSaveOpening} style={{ marginTop: 14 }} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 64, gap: 14 },
  muted: { color: C.mute, fontFamily: FONT_DISPLAY, fontSize: 13, lineHeight: 18 },
  optionList: { gap: 8 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: R.sm + 2,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  optionActive: {
    borderColor: "rgba(247,147,26,0.6)",
    backgroundColor: "rgba(247,147,26,0.07)",
  },
  optionLabel: { flex: 1, color: C.mute, fontFamily: FONT_DISPLAY, fontSize: 15 },
  optionLabelActive: { color: C.text },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: R.pill,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  chipActive: {
    borderColor: "rgba(247,147,26,0.6)",
    backgroundColor: "rgba(247,147,26,0.1)",
  },
  chipLabel: { color: C.mute, fontFamily: FONT_DISPLAY, fontSize: 14 },
  chipLabelActive: { color: C.orange },
  input: {
    backgroundColor: C.panel2,
    borderRadius: R.sm + 2,
    borderWidth: 1,
    borderColor: C.lineSoft,
    color: C.text,
    fontFamily: FONT_MONO,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputFocused: { borderColor: C.orangeFaint },
  amountInput: { fontSize: 24, paddingVertical: 14 },
  currentValue: { color: C.text, fontFamily: FONT_MONO, fontSize: 13, marginTop: 10 },
});
