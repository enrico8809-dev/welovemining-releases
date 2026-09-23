// The shape of the books, and the defaults a fresh set starts from.
//
// Kept apart from storage.ts because that file reaches for AsyncStorage and the
// Expo file system, which do not exist on the desktop. Everything here is plain
// data, so the phone, the Windows app and the sync server can all agree on what
// a ledger is without agreeing on where it lives.

import { Txn } from "./accounting";
import { BusinessDoc } from "./invoices";
import { DEFAULT_LANDED_COST, LandedCostSettings, StockMovement } from "./inventory";
import { Reconciliation } from "./reconcile";
import { DEFAULT_FY_START_MONTH } from "./period";

export interface Settings {
  companyName: string;
  tradingName: string;
  registrationNumber: string;
  vatNumber: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  /** The logo as a resized data URI. Syncs with everything else. */
  logo: string;
  /** Legacy file path from before the logo was stored inline. Migrated on load. */
  logoUri?: string;
  bank: BankDetails;
  fyStartMonth: number;
  defaultPaymentTermsDays: number;
  landedCost: LandedCostSettings;
  /** Target gross margin used to suggest selling prices. */
  targetMarginPct: number;
  /** Shown at the foot of every invoice and quote. */
  invoiceFooter: string;
  quoteValidityDays: number;
  /** Set whenever settings change, so sync can tell which side is newer. */
  updatedAt?: number;
}

/** Printed on invoices so customers know where to pay. */
export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchCode: string;
  accountType: string;
  swift: string;
}

export interface Ledger {
  txns: Txn[];
  docs: BusinessDoc[];
  movements: StockMovement[];
  reconciliations: Reconciliation[];
  openingBank: number;
  /** Sync stamp for the opening balance, which has no record of its own. */
  openingBankUpdatedAt?: number;
  settings: Settings;
}

export const DEFAULT_BANK: BankDetails = {
  bankName: "FNB",
  accountName: "WeLoveMining Pty Ltd",
  accountNumber: "",
  branchCode: "250655", // FNB universal branch code
  accountType: "Cheque / Current",
  swift: "FIRNZAJJ",
};

export const DEFAULT_SETTINGS: Settings = {
  companyName: "WeLoveMining Pty Ltd",
  tradingName: "WeLoveMining",
  registrationNumber: "",
  vatNumber: "",
  email: "info@welovemining.co.za",
  phone: "079 166 6698",
  website: "www.welovemining.co.za",
  address: "",
  logo: "",
  bank: DEFAULT_BANK,
  fyStartMonth: DEFAULT_FY_START_MONTH,
  defaultPaymentTermsDays: 14,
  landedCost: DEFAULT_LANDED_COST,
  targetMarginPct: 20,
  invoiceFooter: "Thank you for your business.",
  quoteValidityDays: 14,
};

export const EMPTY_LEDGER: Ledger = {
  txns: [],
  docs: [],
  movements: [],
  reconciliations: [],
  openingBank: 0,
  settings: DEFAULT_SETTINGS,
};

/** Accepts anything and returns a Ledger — used for both storage and file import. */
export function normaliseLedger(parsed: unknown): Ledger {
  const raw = (parsed ?? {}) as Partial<Ledger>;
  return {
    txns: Array.isArray(raw.txns) ? raw.txns : [],
    docs: Array.isArray(raw.docs) ? raw.docs : [],
    movements: Array.isArray(raw.movements) ? raw.movements : [],
    reconciliations: Array.isArray(raw.reconciliations) ? raw.reconciliations : [],
    openingBank: typeof raw.openingBank === "number" ? raw.openingBank : 0,
    openingBankUpdatedAt:
      typeof raw.openingBankUpdatedAt === "number" ? raw.openingBankUpdatedAt : undefined,
    // `bank` is nested, so a plain spread would drop its defaults when an older
    // backup has no bank block at all.
    settings: {
      ...DEFAULT_SETTINGS,
      ...(raw.settings ?? {}),
      bank: { ...DEFAULT_BANK, ...(raw.settings?.bank ?? {}) },
      landedCost: {
        ...DEFAULT_LANDED_COST,
        ...(raw.settings?.landedCost ?? {}),
        shippingTiers:
          raw.settings?.landedCost?.shippingTiers?.length
            ? raw.settings.landedCost.shippingTiers
            : DEFAULT_LANDED_COST.shippingTiers,
      },
    },
  };
}
