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
import { CRYPTO_ACCOUNT, decimalsFor } from "../lib/crypto";
import { fmt, fmtUnits } from "../lib/format";
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
  const { accounts, txns, balances, cryptoPositions, settings } = useLedger();

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

      {/* The wallet is the one account whose balance can be checked against
          something outside the books: the units here should be the units on the
          exchange. The rand figure is what they cost, not what they are worth. */}
      {account.id === CRYPTO_ACCOUNT && (
        <View style={styles.holdings}>
          <Text style={styles.label}>
            COINS ON HAND · CHECK AGAINST {(settings.crypto.platform || "the exchange").toUpperCase()}
          </Text>
          {cryptoPositions.length === 0 ? (
            <Text style={styles.note}>No coins on hand.</Text>
          ) : (
            cryptoPositions.map((position) => (
              <View key={position.asset} style={styles.holding}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.holdingUnits}>
                    {fmtUnits(position.units, decimalsFor(settings.crypto, position.asset))} {position.asset}
                  </Text>
                  <Text style={styles.holdingNote}>
                    cost {fmt(position.costZar)} · {fmt(position.avgCostZar)} each
                    {position.unknownAsset ? " · not set up in Settings" : ""}
                  </Text>
                </View>
                <View style={styles.holdingRight}>
                  <Text style={styles.holdingMarket}>
                    {position.rateZar > 0 ? fmt(position.marketZar) : "—"}
                  </Text>
                  {position.rateZar > 0 && Math.abs(position.unrealisedZar) >= 0.005 && (
                    <Text
                      style={[
                        styles.holdingNote,
                        { color: position.unrealisedZar > 0 ? C.green : C.red },
                      ]}
                    >
                      {position.unrealisedZar > 0 ? "+" : "−"}
                      {fmt(Math.abs(position.unrealisedZar))}
                    </Text>
                  )}
                </View>
              </View>
            ))
          )}
          <Text style={styles.note}>
            Market value is at the rate in Settings and is not posted anywhere —
            a gain is only booked when coins are actually paid out.
          </Text>
        </View>
      )}

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
  holdings: {
    marginHorizontal: S.lg,
    marginBottom: S.lg,
    padding: S.lg,
    backgroundColor: C.panel,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.line,
  },
  holding: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    marginTop: S.md,
  },
  holdingRight: { alignItems: "flex-end" },
  holdingUnits: { ...T.amountSm, color: C.text },
  holdingMarket: { ...T.amountSm, color: C.textDim },
  holdingNote: { ...T.caption, color: C.mute, marginTop: 2 },
});
