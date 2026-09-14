import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronRight, Download, Upload } from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import Button from "../components/Button";
import Field from "../components/Field";
import { useToast } from "../components/Toast";
import { useLedger } from "../lib/LedgerContext";
import { exportLedger, importLedger } from "../lib/backup";
import { MONTHS } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { RootStackParamList, ComingSoonRoute } from "../navigation/routes";

const MODULES: { label: string; note: string; route: ComingSoonRoute }[] = [
  { label: "Bank Import", note: "FNB CSV & OFX", route: "BankImport" },
  { label: "Inventory", note: "ASIC landed cost", route: "Inventory" },
  { label: "Reconciliation", note: "Match bank to ledger", route: "Reconciliation" },
  { label: "PDF Export", note: "Statements & invoices", route: "Export" },
];

export default function SettingsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const toast = useToast();
  const { settings, updateSettings, exportSnapshot, replaceLedger, txns, docs } = useLedger();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  const handleExport = async () => {
    setBusy("export");
    try {
      const name = await exportLedger(exportSnapshot());
      toast.show(`Exported ${name}`);
    } catch {
      toast.show("Couldn't create the backup file", "error");
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    setBusy("import");
    try {
      const result = await importLedger();
      if (!result) return;
      if (!result.ok) {
        toast.show(result.reason, "error");
        return;
      }
      // Restoring replaces everything, so make the user say so explicitly.
      Alert.alert(
        "Replace all data?",
        `This backup holds ${result.ledger.txns.length} transactions and ${result.ledger.docs.length} documents. Your current data will be overwritten.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restore",
            style: "destructive",
            onPress: async () => {
              await replaceLedger(result.ledger);
              toast.show("Backup restored");
            },
          },
        ]
      );
    } catch {
      toast.show("Couldn't read that file", "error");
    } finally {
      setBusy(null);
    }
  };

  const cycleFyMonth = () => {
    const next = settings.fyStartMonth === 12 ? 1 : settings.fyStartMonth + 1;
    updateSettings({ fyStartMonth: next });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header title="SETTINGS" subtitle="Company & data" onBack={() => nav.goBack()} />

      <View style={styles.body}>
        <Card index={0} title="COMPANY">
          <Field
            label="NAME"
            value={settings.companyName}
            onChangeText={(v) => updateSettings({ companyName: v })}
            autoCapitalize="words"
          />
          <View style={styles.spacer} />
          <Field
            label="REGISTRATION NUMBER"
            value={settings.registrationNumber}
            onChangeText={(v) => updateSettings({ registrationNumber: v })}
            placeholder="2019/123456/07"
            autoCapitalize="characters"
          />
          <View style={styles.spacer} />
          <Field
            label="EMAIL"
            value={settings.email}
            onChangeText={(v) => updateSettings({ email: v })}
            placeholder="accounts@welovemining.co.za"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <View style={styles.spacer} />
          <Field
            label="PHONE"
            value={settings.phone}
            onChangeText={(v) => updateSettings({ phone: v })}
            placeholder="079 166 6698"
            keyboardType="phone-pad"
          />
          <View style={styles.spacer} />
          <Field
            label="ADDRESS"
            value={settings.address}
            onChangeText={(v) => updateSettings({ address: v })}
            multiline
          />
        </Card>

        <Card index={1} title="FINANCIAL YEAR">
          <Pressable onPress={cycleFyMonth} style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Year starts in</Text>
              <Text style={styles.settingNote}>Tap to change · drives the FY filter</Text>
            </View>
            <Text style={styles.settingValue}>{MONTHS[settings.fyStartMonth - 1]}</Text>
          </Pressable>
        </Card>

        <Card index={2} title="DATA">
          <View style={styles.stats}>
            <Text style={styles.statText}>
              {txns.length} transaction{txns.length === 1 ? "" : "s"} · {docs.length} document
              {docs.length === 1 ? "" : "s"}
            </Text>
          </View>
          <Button
            label="Export backup"
            variant="secondary"
            onPress={handleExport}
            loading={busy === "export"}
            icon={<Download color={C.text} size={17} />}
          />
          <View style={styles.gap} />
          <Button
            label="Restore from backup"
            variant="secondary"
            onPress={handleImport}
            loading={busy === "import"}
            icon={<Upload color={C.text} size={17} />}
          />
          <Text style={styles.note}>
            Everything lives on this phone only. Export regularly — a lost phone is a lost
            book.
          </Text>
        </Card>

        <Card index={3} title="MODULES IN PROGRESS">
          {MODULES.map((m) => (
            <Pressable
              key={m.route}
              onPress={() => nav.navigate(m.route)}
              style={({ pressed }) => [styles.moduleRow, pressed && styles.pressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.moduleLabel}>{m.label}</Text>
                <Text style={styles.moduleNote}>{m.note}</Text>
              </View>
              <Text style={styles.soon}>Soon</Text>
              <ChevronRight color={C.mute} size={16} />
            </Pressable>
          ))}
        </Card>

        <Card index={4} title="ABOUT">
          <Text style={styles.about}>
            WLM Accounting records every transaction once and categorises it once, using
            double-entry underneath. You pick what happened; the app books the debit and
            credit. An invoice recognises income when it is issued — the matching bank
            deposit clears the receivable instead of creating income again.
          </Text>
          <Text style={styles.version}>Version 1.1.0 · No VAT (not yet registered)</Text>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: S.huge },
  body: { paddingHorizontal: S.lg, gap: S.lg },
  spacer: { height: S.lg },
  gap: { height: S.md },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    paddingVertical: S.sm,
  },
  settingLabel: { ...T.body, color: C.text },
  settingNote: { ...T.caption, color: C.mute, marginTop: 2 },
  settingValue: { ...T.amount, color: C.orange },
  stats: { marginBottom: S.md },
  statText: { ...T.small, color: C.mute },
  note: { ...T.caption, color: C.mute, marginTop: S.md, lineHeight: 17 },
  moduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm,
    paddingVertical: S.md,
    borderRadius: R.sm,
  },
  pressed: { backgroundColor: C.panel2 },
  moduleLabel: { ...T.body, color: C.text },
  moduleNote: { ...T.caption, color: C.mute, marginTop: 2 },
  soon: { ...T.caption, color: C.amber },
  about: { ...T.small, color: C.textDim, lineHeight: 21 },
  version: { ...T.caption, color: C.mute, marginTop: S.md },
});
