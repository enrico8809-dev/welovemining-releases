# FNB PDF statements → CSV

The app imports FNB's **CSV** and **OFX** exports. It cannot read the **PDF**
statements, and those are what FNB emails you. This turns one into the other.

```bash
pip install pypdf
python3 tools/fnb_pdf_to_csv.py <folder of PDFs> <folder for the CSVs>
```

One CSV per statement, named for the month it closes in, plus a combined file.
Import either — re-importing is safe, because entries carry an id derived from
the statement line, so an overlap comes up flagged rather than doubled.

## What it checks

Every FNB row carries the running balance, so the statement can be used to
check the reading of itself: each amount applied to the previous row's balance
has to land exactly on the printed one, and the last row has to land on the
closing balance. A statement that fails is reported and **not written out** —
a converter that quietly produces plausible figures is worse than one that
refuses.

It also reports gaps between statements, and any month whose opening balance
disagrees with the previous month's closing.

## Two things in the PDF that are easy to read wrongly

**Direction.** A bare amount is money *out*; only amounts marked `Cr` are money
in. Read naively, every expense becomes income — which is the exact error this
application exists to prevent. The CSV carries explicit signs instead, so
nothing downstream has to know FNB's convention.

**Overdrawn balances.** FNB prints `237.53Cr` in credit but just `15.95` when
the account is in the red — the `Dr` is omitted. A row can therefore end in
three bare figures, `54.00 23.00 3.68`, where the reading matters: that is a
R54.00 purchase leaving R23.00 overdrawn with R3.68 of charges accrued, not a
R23.00 purchase. The split is not guessed — it is whichever reading reconciles
with the running balance.

## Rows with no description

FNB prints no description against its own fees, which can be a quarter of the
rows. They are labelled `Bank charge`, on the evidence that in every statement
tested they sum to the exact fee total printed in the statement header — to the
cent, across eight statements. That makes them categorisable in one go instead
of arriving as a hundred unlabelled lines.

## Checking the parser against real statements

`src/lib/__tests__/realStatements.test.ts` runs the app's own import parser over
converted statements and checks the result against the bank's running balance,
the direction of each entry, the double entry each line produces, and that a
second import of the same file is rejected as duplicate.

It skips unless pointed at a folder, because real statements are nobody's
business but the owner's and are not in this repository:

```bash
WLM_STATEMENTS=/path/to/converted/csvs npm test
```
