import React from "react";
import ComingSoonScreen from "./ComingSoonScreen";

export function BankImportScreen() {
  return (
    <ComingSoonScreen
      moduleNumber={2}
      title="Bank Import"
      blurb="Pull a month of FNB activity in at once instead of typing it, while still deciding what each line actually was."
      planned={[
        "Import an FNB CSV (Date, Amount, Balance, Description) including the metadata rows above the header.",
        "Import an OFX statement — STMTTRN blocks with DTPOSTED, TRNAMT and MEMO; negative amounts are money out.",
        "Show every parsed line so you can assign a recipe before anything is posted.",
        "Never auto-post an uncategorised line — that is how books drift out of shape.",
        "Flag lines that look like duplicates of entries already captured.",
      ]}
    />
  );
}


export function ReconciliationScreen() {
  return (
    <ComingSoonScreen
      moduleNumber={5}
      title="Reconciliation"
      blurb="Prove the books agree with the bank, and see exactly what doesn't."
      planned={[
        "Match imported bank lines against ledger entries by date and amount.",
        "Flag anything unmatched on either side so nothing silently disappears.",
        "Let you clear a match manually where the description differs.",
        "Show a reconciled-to date, so you know how far the books are trusted.",
      ]}
    />
  );
}

