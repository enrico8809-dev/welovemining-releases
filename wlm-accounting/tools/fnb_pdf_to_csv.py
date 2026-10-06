"""
FNB PDF statement -> CSV the accounting app can import.

The app reads FNB's CSV and OFX exports; these are the PDF ones, which it
cannot. This turns them into the CSV shape, and — more to the point — checks
its own work before handing anything over.

Two things in the PDF are easy to get wrong and expensive to get wrong:

  Direction. A bare amount on an FNB statement is money OUT; only amounts
  marked Cr are money in. An importer that reads an unsigned number as
  positive turns every expense into income, which is the exact error this
  whole application exists to prevent. The CSV therefore carries explicit
  signs rather than FNB's Cr markers.

  The year. Transaction rows say "26 Jan" and nothing more. The year comes
  from the statement period in the header, and a statement spanning New Year
  has two of them.

Both are checked by the statement's own arithmetic: every row carries the
running balance, so opening + each amount in turn must land exactly on the
closing balance. If a single row is misread the chain breaks, and this
refuses to write that statement out rather than hand over plausible rubbish.
"""

import csv
import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pypdf

MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
)}

# A row opens with the day and month; everything after that is read from the
# right, because the columns are positional and the description is not.
ROW_START = re.compile(r"^(?P<day>\d{1,2})\s+(?P<mon>[A-Za-z]{3})\s+(?P<rest>.*)$")
FIGURE = re.compile(r"^(?P<value>[\d,]+\.\d{2})(?P<marker>Cr|Dr)?$", re.I)


PERIOD = re.compile(
    r"Statement Period\s*:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+to\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})",
    re.I,
)
OPENING = re.compile(r"Opening Balance\s+([\d,]+\.\d{2})(Cr|Dr)?", re.I)
CLOSING = re.compile(r"Closing Balance\s+([\d,]+\.\d{2})(Cr|Dr)?", re.I)
ACCOUNT = re.compile(r"Account\s*:\s*(\d{6,})", re.I)


def money(text: str, marker: str | None) -> float:
    """FNB writes direction as a suffix: bare is out, Cr is in."""
    value = float(text.replace(",", ""))
    return value if (marker or "").lower() == "cr" else -value


def read_columns(rest: str, running: float) -> tuple[str, float, float] | None:
    """
    Pull description, amount and balance out of one row.

    The columns are amount, balance, and sometimes accrued bank charges. FNB
    prints direction as a suffix and omits it entirely when a balance is
    overdrawn, so three bare figures — "54.00 23.00 3.68" — could be read two
    ways, and one of them turns a R54 purchase into a R23 one.

    So the split is not guessed: the row before this one leaves a known
    balance, and only one reading of the columns lands on the figure printed
    in this row. That is the split taken. Where none fits, the suffixes decide
    and the balance check downstream reports it.
    """
    tokens = rest.split()
    figures: list[tuple[int, str, str]] = []
    for i in range(len(tokens) - 1, -1, -1):
        match = FIGURE.match(tokens[i])
        if not match or len(figures) == 3:
            break
        figures.append((i, match.group("value"), (match.group("marker") or "")))

    figures.reverse()
    if len(figures) < 2:
        return None

    def split_at(amount_index: int) -> tuple[str, float, float]:
        amount_at = figures[amount_index]
        balance_at = figures[amount_index + 1]
        description = " ".join(tokens[: amount_at[0]])
        return (
            re.sub(r"\s+", " ", description).strip(),
            money(amount_at[1], amount_at[2]),
            money(balance_at[1], balance_at[2]),
        )

    candidates = [-2]
    if len(figures) >= 3:
        candidates.append(-3)

    for index in candidates:
        _, amount, balance = split_at(index)
        if abs(round(running + amount, 2) - balance) < 0.005:
            return split_at(index)

    # Nothing reconciles. Fall back to what the suffixes imply, which keeps the
    # row rather than dropping it, and let the check downstream say so.
    if figures[-1][2] or len(figures) < 3:
        return split_at(-2)
    return split_at(-3)


@dataclass
class Row:
    when: date
    description: str
    amount: float
    balance: float


@dataclass
class Statement:
    path: Path
    account: str
    start: date
    end: date
    opening: float
    closing: float
    rows: list[Row]
    problems: list[str]


def read_text(path: Path) -> str:
    reader = pypdf.PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def month_number(name: str) -> int | None:
    return MONTHS.get(name[:3].lower())


def resolve_year(day: int, month: int, start: date, end: date) -> date | None:
    """
    A row says "26 Jan". The year is whichever one puts it inside the
    statement period — which is how a December-to-January statement keeps its
    two halves in the right years.
    """
    # A statement carries a few transactions from just before it opens — a card
    # swipe on the 30th settling on the 1st — so the window is a little wider
    # than the stated period at both ends.
    for year in {start.year, end.year, start.year - 1, end.year + 1}:
        try:
            candidate = date(year, month, day)
        except ValueError:
            continue
        if (candidate - start).days >= -10 and (candidate - end).days <= 10:
            return candidate
    return None


def parse(path: Path) -> Statement:
    text = read_text(path)
    problems: list[str] = []

    period = PERIOD.search(text)
    if not period:
        raise ValueError("no statement period in the header — cannot date the rows")
    start = date(int(period.group(3)), month_number(period.group(2)), int(period.group(1)))
    end = date(int(period.group(6)), month_number(period.group(5)), int(period.group(4)))

    opening_match = OPENING.search(text)
    closing_match = CLOSING.search(text)
    if not opening_match or not closing_match:
        raise ValueError("no opening/closing balance — nothing to check the rows against")
    opening = money(opening_match.group(1), opening_match.group(2) or "Cr")
    closing = money(closing_match.group(1), closing_match.group(2) or "Cr")

    account_match = ACCOUNT.search(text)
    account = account_match.group(1) if account_match else "unknown"

    rows: list[Row] = []
    running = opening
    for line in text.splitlines():
        match = ROW_START.match(line.strip())
        if not match:
            continue
        month = month_number(match.group("mon"))
        if not month:
            continue
        columns = read_columns(match.group("rest"), running)
        if not columns:
            continue
        description, amount, balance = columns

        when = resolve_year(int(match.group("day")), month, start, end)
        if not when:
            problems.append(
                f"row dated {match.group('day')} {match.group('mon')} "
                f"({description[:40] or 'no description'}) sits outside the statement period"
            )
            continue

        if not description and amount < 0:
            # FNB prints no description against its own charges. That is not a
            # guess: in every statement here, the rows with no description sum
            # to the exact fee total the header states — 38.28, 288.90, 362.44
            # and so on, to the cent. Leaving a hundred-odd rows labelled
            # "(no description)" would make them unusable; naming them lets the
            # lot be categorised as bank charges in one go.
            description = "Bank charge"

        rows.append(Row(when=when, description=description, amount=amount, balance=balance))
        running = balance

    # The statement checks itself: each row's balance must be the one before it
    # plus this row's amount, and the last must be the closing balance.
    running = opening
    for i, row in enumerate(rows, start=1):
        running = round(running + row.amount, 2)
        if abs(running - row.balance) > 0.005:
            problems.append(
                f"row {i} ({row.when} {row.description[:40] or '(no description)'}): "
                f"running balance {running:.2f} but the statement says {row.balance:.2f}"
            )
            running = row.balance  # carry on from the statement's figure

    if rows and abs(rows[-1].balance - closing) > 0.005:
        problems.append(
            f"last row leaves {rows[-1].balance:.2f} but the closing balance is {closing:.2f}"
        )

    return Statement(path, account, start, end, opening, closing, rows, problems)


def write_csv(statement: Statement, out: Path) -> None:
    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["Date", "Description", "Amount", "Balance"])
        for row in statement.rows:
            writer.writerow([
                row.when.isoformat(),
                row.description,
                f"{row.amount:.2f}",
                f"{row.balance:.2f}",
            ])


def main() -> int:
    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    target.mkdir(parents=True, exist_ok=True)

    seen: dict[str, Path] = {}
    statements: list[Statement] = []

    for pdf in sorted(source.glob("*.pdf")):
        try:
            statement = parse(pdf)
        except Exception as error:  # noqa: BLE001 — report, don't crash the batch
            print(f"!! {pdf.name[:40]}: {error}")
            continue

        key = f"{statement.account}-{statement.start}-{statement.end}"
        if key in seen:
            print(f"   {statement.start} to {statement.end}: duplicate upload, skipped")
            continue
        seen[key] = pdf
        statements.append(statement)

    statements.sort(key=lambda s: s.start)

    for statement in statements:
        name = f"fnb-{statement.end:%Y-%m}.csv"
        status = "OK " if not statement.problems else "!! "
        print(
            f"{status}{statement.start} to {statement.end}  "
            f"{len(statement.rows):3d} rows  "
            f"opening {statement.opening:>12,.2f}  closing {statement.closing:>12,.2f}  -> {name}"
        )
        for problem in statement.problems:
            print(f"      {problem}")
        if not statement.problems:
            write_csv(statement, target / name)

    clean = [s for s in statements if not s.problems]
    if clean:
        combined = Statement(
            Path("combined"), clean[0].account, clean[0].start, clean[-1].end,
            clean[0].opening, clean[-1].closing,
            [row for s in clean for row in s.rows], [],
        )
        write_csv(combined, target / "fnb-all-statements.csv")
        print(f"\n   combined: {len(combined.rows)} rows -> fnb-all-statements.csv")

    # Gaps matter: a missing month is a hole in the books that nothing else
    # would reveal until a reconciliation refuses to balance.
    for earlier, later in zip(clean, clean[1:]):
        if (later.start - earlier.end).days > 1:
            print(f"\n   GAP: nothing between {earlier.end} and {later.start}")
        if abs(later.opening - earlier.closing) > 0.005:
            print(
                f"\n   MISMATCH: {earlier.end} closes at {earlier.closing:,.2f} "
                f"but {later.start} opens at {later.opening:,.2f}"
            )

    return 0 if all(not s.problems for s in statements) else 1


if __name__ == "__main__":
    sys.exit(main())
