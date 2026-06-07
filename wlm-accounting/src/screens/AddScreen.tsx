import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import { useLedger } from "../lib/LedgerContext";
import { Account, RECIPES, Recipe, Txn } from "../lib/accounting";
import { fmt } from "../lib/format";
import { C, FONT_DISPLAY, FONT_DISPLAY_BOLD, FONT_MONO } from "../lib/theme";

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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header />

      <Card>
        <Text style={styles.label}>WHAT HAPPENED?</Text>
        <View style={styles.recipeList}>
          {RECIPES.map((r) => {
            const active = r.id === recipeId;
            return (
              <Pressable
                key={r.id}
                onPress={() => selectRecipe(r)}
                style={[styles.recipeOption, active && styles.recipeOptionActive]}
              >
                <View style={[styles.dot, { backgroundColor: r.dir === "in" ? C.green : C.red }]} />
                <Text style={[styles.recipeLabel, active && { color: C.text }]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {recipe.pick && (
        <Card>
          <Text style={styles.label}>
            {recipe.pickTypes?.includes("income") ? "WHICH INCOME ACCOUNT?" : "WHICH EXPENSE ACCOUNT?"}
          </Text>
          <View style={styles.recipeList}>
            {pickOptions.map((a) => {
              const active = a.id === pickedAccountId;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => setPickedAccountId(a.id)}
                  style={[styles.recipeOption, active && styles.recipeOptionActive]}
                >
                  <Text style={[styles.recipeLabel, active && { color: C.text }]}>{a.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      )}

      <Card>
        <Text style={styles.label}>AMOUNT (ZAR)</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          placeholderTextColor={C.mute}
          keyboardType="decimal-pad"
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: 16 }]}>DESCRIPTION</Text>
        <TextInput
          value={desc}
          onChangeText={setDesc}
          placeholder="e.g. Antminer S21 sale to J. Smit"
          placeholderTextColor={C.mute}
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: 16 }]}>DATE (YYYY-MM-DD)</Text>
        <TextInput
          value={date}
          onChangeText={setDate}
          placeholder={todayISO()}
          placeholderTextColor={C.mute}
          style={styles.input}
        />
      </Card>

      <Pressable style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Save transaction</Text>
      </Pressable>

      <Card>
        <Text style={styles.label}>OPENING BANK BALANCE</Text>
        <Text style={styles.muted}>Set this once — it seeds the FNB Bank Account before any transactions.</Text>
        <TextInput
          value={openingInput}
          onChangeText={setOpeningInput}
          placeholder="0.00"
          placeholderTextColor={C.mute}
          keyboardType="decimal-pad"
          style={[styles.input, { marginTop: 12 }]}
        />
        <Text style={styles.currentValue}>Current: {fmt(openingBank)}</Text>
        <Pressable style={styles.secondaryButton} onPress={handleSaveOpening}>
          <Text style={styles.secondaryButtonText}>Save opening balance</Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 60, gap: 14 },
  label: {
    color: C.mute,
    fontFamily: FONT_DISPLAY_BOLD,
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  muted: { color: C.mute, fontFamily: FONT_DISPLAY, fontSize: 13 },
  recipeList: { gap: 8 },
  recipeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
  },
  recipeOptionActive: {
    borderColor: C.orange,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  recipeLabel: { color: C.mute, fontFamily: FONT_DISPLAY, fontSize: 15 },
  input: {
    backgroundColor: C.panel2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    color: C.text,
    fontFamily: FONT_MONO,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  saveButton: {
    backgroundColor: C.orange,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveButtonText: {
    color: C.bg,
    fontFamily: FONT_DISPLAY_BOLD,
    fontSize: 17,
    letterSpacing: 0.5,
  },
  currentValue: {
    color: C.text,
    fontFamily: FONT_MONO,
    fontSize: 14,
    marginTop: 10,
  },
  secondaryButton: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.orange,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: C.orange,
    fontFamily: FONT_DISPLAY_BOLD,
    fontSize: 14,
  },
});
