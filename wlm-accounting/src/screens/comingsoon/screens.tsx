import React from "react";
import ComingSoonScreen from "./ComingSoonScreen";

export function BankImportScreen() {
  return (
    <ComingSoonScreen
      moduleNumber={2}
      title="Bank Import"
      blurb={
        "Import an FNB CSV (Date, Amount, Balance, Description) or OFX statement. " +
        "Each line will be shown so you can assign a recipe before it's posted — " +
        "nothing is ever auto-posted without being categorised."
      }
    />
  );
}

export function InvoicesScreen() {
  return (
    <ComingSoonScreen
      moduleNumber={3}
      title="Invoices & Quotes"
      blurb={
        "Create numbered quotes (QUO-XXXX) and invoices (INV-XXXX). An unpaid invoice " +
        "posts Dr Receivables / Cr Sales. Marking it paid posts Dr Bank / Cr Receivables — " +
        "this is exactly how the app prevents double-counting income."
      }
    />
  );
}

export function InventoryScreen() {
  return (
    <ComingSoonScreen
      moduleNumber={4}
      title="Inventory"
      blurb={
        "An ASIC product catalogue with landed cost: supplier USD price converted to ZAR " +
        "plus shipping and clearing fees. No customs duty applies to this electronics class, " +
        "and import VAT is excluded for now since the company isn't VAT-registered."
      }
    />
  );
}

export function ReconciliationScreen() {
  return (
    <ComingSoonScreen
      moduleNumber={5}
      title="Reconciliation"
      blurb={
        "Match imported bank lines against ledger entries, and flag anything left " +
        "unmatched on either side so nothing slips through uncategorised."
      }
    />
  );
}

export function ExportScreen() {
  return (
    <ComingSoonScreen
      moduleNumber={6}
      title="PDF Export"
      blurb={
        "Export the Trial Balance, Profit & Loss, and individual invoices as PDFs " +
        "you can email or print, using expo-print and expo-sharing."
      }
    />
  );
}
