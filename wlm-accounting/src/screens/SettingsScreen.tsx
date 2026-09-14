import React, { useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronRight, Download, ImagePlus, Trash2, Upload } from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import Button from "../components/Button";
import Field from "../components/Field";
import { useToast } from "../components/Toast";
import { useLedger } from "../lib/LedgerContext";
import { exportLedger, importLedger } from "../lib/backup";
import { deleteCompanyLogo, pickCompanyLogo } from "../lib/logo";
import { MONTHS } from "../lib/format";
import { APP_VERSION } from "../lib/version";
import { C, R, S, T } from "../lib/theme";
import { RootStackParamList, ComingSoonRoute } from "../navigation/routes";

const MODULES: { label: string; note: string; route: ComingSoonRoute }[] = [
  { label: "Bank Import", note: "FNB CSV & OFX", route: "BankImport" },
  { label: "Inventory", note: "ASIC landed cost", route: "Inventory" },
  { label: "Reconciliation", note: "Match bank to ledger", route: "Reconciliation" },
];

export default function SettingsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const toast = useToast();
  const { settings, updateSettings, exportSnapshot, replaceLedger, txns, docs } = useLedger();
  const [busy, setBusy] = useState<"export" | "import" | "logo" | null>(null);

  const patchBank = (patch: Partial<typeof settings.bank>) =>
    updateSettings({ bank: { ...settings.bank, ...patch } });

  const handlePickLogo = async () => {
    setBusy("logo");
    try {
      const uri = await pickCompanyLogo();
      if (!uri) return;
      if (settings.logoUri && settings.logoUri !== uri) deleteCompanyLogo(settings.logoUri);
      updateSettings({ logoUri: uri });
      toast.show("Logo updated — it'll appear on invoices");
    } catch (e) {
      toast.show(
        (e as Error).message === "no-permission"
          ? "Allow photo access to pick a logo"
          : "Couldn't load that image",
        "error"
      );
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveLogo = () => {
    if (settings.logoUri) deleteCompanyLogo(settings.logoUri);
    updateSettings({ logoUri: "" });
    toast.show("Logo removed");
  };

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

  const cycleFyMonth = () =>
    updateSettings({ fyStartMonth: settings.fyStartMonth === 12 ? 1 : settings.fyStartMonth + 1 });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header title="SETTINGS" subtitle={`Company & data · v${APP_VERSION}`} onBack={() => nav.goBack()} />

      <View style={styles.body}>
        <Card index={0} title="LOGO">
          <Text style={styles.note}>Printed at the top of every invoice and quote.</Text>
          <View style={styles.logoRow}>
            <View style={styles.logoFrame}>
              {settings.logoUri ? (
                <Image source={{ uri: settings.logoUri }} style={styles.logo} resizeMode="contain" />
              ) : (
                <ImagePlus color={C.mute} size={26} />
              )}
            </View>
            <View style={styles.logoActions}>
              <Button
                label={settings.logoUri ? "Change logo" : "Upload logo"}
                variant="secondary"
                onPress={handlePickLogo}
                loading={busy === "logo"}
              />
              {!!settings.logoUri && (
                <Button
                  label="Remove"
                  variant="danger"
                  onPress={handleRemoveLogo}
                  icon={<Trash2 color={C.red} size={15} />}
                />
              )}
            </View>
          </View>
        </Card>

        <Card index={1} title="COMPANY">
          <Field
            label="REGISTERED NAME"
            value={settings.companyName}
            onChangeText={(v) => updateSettings({ companyName: v })}
            autoCapitalize="words"
          />
          <Gap />
          <Field
            label="TRADING NAME"
            value={settings.tradingName}
            onChangeText={(v) => updateSettings({ tradingName: v })}
            autoCapitalize="words"
          />
          <Gap />
          <Field
            label="REGISTRATION NUMBER"
            value={settings.registrationNumber}
            onChangeText={(v) => updateSettings({ registrationNumber: v })}
            placeholder="2019/123456/07"
            autoCapitalize="characters"
          />
          <Gap />
          <Field
            label="VAT NUMBER (LEAVE BLANK IF NOT REGISTERED)"
            value={settings.vatNumber}
            onChangeText={(v) => updateSettings({ vatNumber: v })}
            placeholder="Not registered"
            autoCapitalize="characters"
          />
          <Gap />
          <Field
            label="EMAIL"
            value={settings.email}
            onChangeText={(v) => updateSettings({ email: v })}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Gap />
          <Field
            label="PHONE"
            value={settings.phone}
            onChangeText={(v) => updateSettings({ phone: v })}
            keyboardType="phone-pad"
          />
          <Gap />
          <Field
            label="WEBSITE"
            value={settings.website}
            onChangeText={(v) => updateSettings({ website: v })}
            autoCapitalize="none"
          />
          <Gap />
          <Field
            label="ADDRESS"
            value={settings.address}
            onChangeText={(v) => updateSettings({ address: v })}
            placeholder={"Unit 1, Example Park\nJohannesburg, 2000"}
            multiline
          />
        </Card>

        <Card index={2} title="BANK DETAILS">
          <Text style={styles.note}>
            Printed on unpaid invoices so customers know where to pay. The invoice number is
            used as the payment reference.
          </Text>
          <Gap />
          <Field
            label="BANK"
            value={settings.bank.bankName}
            onChangeText={(v) => patchBank({ bankName: v })}
            autoCapitalize="words"
          />
          <Gap />
          <Field
            label="ACCOUNT NAME"
            value={settings.bank.accountName}
            onChangeText={(v) => patchBank({ accountName: v })}
            autoCapitalize="words"
          />
          <Gap />
          <Field
            label="ACCOUNT NUMBER"
            value={settings.bank.accountNumber}
            onChangeText={(v) => patchBank({ accountNumber: v })}
            keyboardType="number-pad"
            mono
          />
          <Gap />
          <Field
            label="BRANCH CODE"
            value={settings.bank.branchCode}
            onChangeText={(v) => patchBank({ branchCode: v })}
            keyboardType="number-pad"
            mono
          />
          <Gap />
          <Field
            label="ACCOUNT TYPE"
            value={settings.bank.accountType}
            onChangeText={(v) => patchBank({ accountType: v })}
            autoCapitalize="words"
          />
          <Gap />
          <Field
            label="SWIFT (FOR OVERSEAS PAYMENTS)"
            value={settings.bank.swift}
            onChangeText={(v) => patchBank({ swift: v })}
            autoCapitalize="characters"
            mono
          />
        </Card>

        <Card index={3} title="INVOICING">
          <Pressable onPress={cycleFyMonth} style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Financial year starts</Text>
              <Text style={styles.settingNote}>Tap to change · drives the FY filter</Text>
            </View>
            <Text style={styles.settingValue}>{MONTHS[settings.fyStartMonth - 1]}</Text>
          </Pressable>
          <Gap />
          <Field
            label="PAYMENT TERMS (DAYS)"
            value={String(settings.defaultPaymentTermsDays)}
            onChangeText={(v) =>
              updateSettings({ defaultPaymentTermsDays: Number(v.replace(/[^0-9]/g, "")) || 0 })
            }
            keyboardType="number-pad"
            mono
          />
          <Gap />
          <Field
            label="QUOTE VALID FOR (DAYS)"
            value={String(settings.quoteValidityDays)}
            onChangeText={(v) =>
              updateSettings({ quoteValidityDays: Number(v.replace(/[^0-9]/g, "")) || 0 })
            }
            keyboardType="number-pad"
            mono
          />
          <Gap />
          <Field
            label="FOOTER NOTE"
            value={settings.invoiceFooter}
            onChangeText={(v) => updateSettings({ invoiceFooter: v })}
            multiline
          />
        </Card>

        <Card index={4} title="DATA">
          <Text style={styles.statText}>
            {txns.length} transaction{txns.length === 1 ? "" : "s"} · {docs.length} document
            {docs.length === 1 ? "" : "s"}
          </Text>
          <Gap />
          <Button
            label="Export backup"
            variant="secondary"
            onPress={handleExport}
            loading={busy === "export"}
            icon={<Download color={C.text} size={17} />}
          />
          <View style={{ height: S.md }} />
          <Button
            label="Restore from backup"
            variant="secondary"
            onPress={handleImport}
            loading={busy === "import"}
            icon={<Upload color={C.text} size={17} />}
          />
          <Text style={styles.note}>
            Everything lives on this phone only. Export regularly — a lost phone is a lost book.
          </Text>
        </Card>

        <Card index={5} title="MODULES IN PROGRESS">
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

        <Card index={6} title="ABOUT">
          <Text style={styles.about}>
            WLM Accounting records every transaction once and categorises it once, using
            double-entry underneath. You pick what happened; the app books the debit and credit.
            An invoice recognises income when it is issued — the matching bank deposit clears
            the receivable instead of creating income again.
          </Text>
          <Text style={styles.version}>
            Version {APP_VERSION}
            {settings.vatNumber ? "" : " · Not registered for VAT"}
          </Text>
        </Card>
      </View>
    </ScrollView>
  );
}

function Gap() {
  return <View style={{ height: S.lg }} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: S.huge },
  body: { paddingHorizontal: S.lg, gap: S.lg },
  logoRow: { flexDirection: "row", gap: S.lg, alignItems: "center", marginTop: S.md },
  logoFrame: {
    width: 104,
    height: 84,
    borderRadius: R.md,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logo: { width: "88%", height: "88%" },
  logoActions: { flex: 1, gap: S.sm },
  settingRow: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.sm },
  settingLabel: { ...T.body, color: C.text },
  settingNote: { ...T.caption, color: C.mute, marginTop: 2 },
  settingValue: { ...T.amount, color: C.orange },
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
