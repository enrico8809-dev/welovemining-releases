import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Account, SEED_ACCOUNTS, Txn, computeBalances } from "./accounting";
import { Ledger, loadLedger, saveLedger } from "./storage";

interface LedgerContextValue {
  loading: boolean;
  accounts: Account[];
  txns: Txn[];
  openingBank: number;
  balances: Record<string, number>;
  addTxn: (txn: Txn) => Promise<void>;
  removeTxn: (id: string) => Promise<void>;
  setOpeningBank: (amount: number) => Promise<void>;
}

const LedgerContext = createContext<LedgerContextValue | undefined>(undefined);

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState<Ledger>({ txns: [], openingBank: 0 });

  useEffect(() => {
    let cancelled = false;
    loadLedger().then((loaded) => {
      if (!cancelled) {
        setLedger(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: Ledger) => {
    setLedger(next);
    await saveLedger(next);
  }, []);

  const addTxn = useCallback(
    async (txn: Txn) => {
      await persist({ ...ledger, txns: [txn, ...ledger.txns] });
    },
    [ledger, persist]
  );

  const removeTxn = useCallback(
    async (id: string) => {
      await persist({ ...ledger, txns: ledger.txns.filter((t) => t.id !== id) });
    },
    [ledger, persist]
  );

  const setOpeningBank = useCallback(
    async (amount: number) => {
      await persist({ ...ledger, openingBank: amount });
    },
    [ledger, persist]
  );

  const balances = useMemo(
    () => computeBalances(SEED_ACCOUNTS, ledger.txns, ledger.openingBank),
    [ledger.txns, ledger.openingBank]
  );

  const value = useMemo<LedgerContextValue>(
    () => ({
      loading,
      accounts: SEED_ACCOUNTS,
      txns: ledger.txns,
      openingBank: ledger.openingBank,
      balances,
      addTxn,
      removeTxn,
      setOpeningBank,
    }),
    [loading, ledger.txns, ledger.openingBank, balances, addTxn, removeTxn, setOpeningBank]
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error("useLedger must be used within a LedgerProvider");
  return ctx;
}
