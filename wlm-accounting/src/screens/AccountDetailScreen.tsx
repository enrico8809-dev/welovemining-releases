import React, { useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Receipt } from "lucide-react-native";
import Header from "../components/Header";
import TxnRow from "../components/TxnRow";
import EmptyState from "../components/EmptyState";
import { useLedger } from "../lib/LedgerContext";
import {
  displayBalance,
  findAccount,
  sortByDateDesc,
  txnsForAccount,
} from "../lib/accounting";
import { fmt } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";

type DetailRoute = RouteProp<RootStackParamList, "AccountDetail">;

const TYPE_LABEL: Record<string, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  expense: "Expense",
};

export default function AccountDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<DetailRoute>();
  const { accounts, txns, balances } = useLedger();

  const account = findAccount(accounts, route.params.accountId);
  const rows = useMemo(
    () => (account ? sortByDateDesc(txnsForAccount(txns, account.id)) : []),
    [txns, account]
  );

  if (!account) {
    return (
      <View style={styles.screen}>
        <Header title="NOT FOUND" onBack={() => nav.goBack()} />
      </View>
    );
  }

  const raw = balances[account.id] ?? 0;
  const shown = displayBalance(account, raw);
  const isDebitBalance = raw >= 0;

  return (
    <View style={styles.screen}>
      <Header
        title={account.name.toUpperCase()}
        subtitle={`${TYPE_LABEL[account.type]} · ${rows.length} entries`}
        onBack={() => nav.goBack()}
      />

      <View style={styles.summary}>
        <Text style={styles.label}>BALANCE</Text>
        <Text style={styles.balance}>{fmt(shown)}</Text>
        <Text style={styles.note}>
          {isDebitBalance ? "Debit balance" : "Credit balance"} · shown as a positive figure
        </Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <TxnRow txn={item} accounts={accounts} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Receipt color={C.mute} size={28} />}
            title="Nothing posted here"
            body={`No transactions have touched ${account.name} yet.`}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  summary: {
    marginHorizontal: S.lg,
    marginBottom: S.lg,
    padding: S.lg,
    backgroundColor: C.panel,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.line,
  },
  label: { ...T.label, color: C.mute },
  balance: { ...T.hero, fontSize: 32, color: C.text, marginTop: S.xs },
  note: { ...T.caption, color: C.mute, marginTop: S.xs },
  list: { paddingHorizontal: S.lg, paddingBottom: S.huge, flexGrow: 1 },
  sep: { height: 1, backgroundColor: C.line },
});
