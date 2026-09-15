import React from "react";
import ComingSoonScreen from "./ComingSoonScreen";


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

