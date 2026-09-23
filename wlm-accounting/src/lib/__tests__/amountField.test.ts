import { NO_DRAFT, amountBlurred, amountText, amountTyped } from "../amountField";
import { abs, parseAmount } from "../format";

/**
 * Drives the amount field the way a finger does: focus, one character at a time,
 * then focus away. The parent is whatever the calling screen does with the text
 * between keystrokes — that is where the bug lived, so both kinds of parent are
 * exercised here.
 */
function typeInto(parent: Parent, keys: string): void {
  let draft = NO_DRAFT;
  draft = NO_DRAFT; // focus

  let typed = "";
  for (const key of keys) {
    typed += key;
    const next = amountTyped(typed);
    draft = next.draft;
    parent.set(next.emit);
    // The parent re-renders, and the field shows whatever this says.
    typed = amountText(draft, parent.get());
  }

  const blur = amountBlurred(amountText(draft, parent.get()));
  if (blur.emit !== null) parent.set(blur.emit);
}

interface Parent {
  set(text: string): void;
  get(): string;
}

/** AddScreen and ReconciliationScreen: the text is the state. */
function textParent(): Parent & { text: string } {
  return {
    text: "",
    set(t: string) {
      this.text = t;
    },
    get() {
      return this.text;
    },
  };
}

/** DocEditorScreen: the state is a number, and the text is derived back from it. */
function numberParent(): Parent & { amount: number } {
  return {
    amount: 0,
    set(t: string) {
      const n = parseAmount(t);
      this.amount = Number.isFinite(n) ? n : 0;
    },
    get() {
      return this.amount ? abs(this.amount) : "";
    },
  };
}

describe("amount field editing", () => {
  it("keeps cents typed into a screen that stores the amount as a number", () => {
    // The reported bug: an invoice line priced at R 1,200.50 became R 1,200,500.00,
    // because the derived value dropped the decimal point mid-entry and every
    // following digit shifted the amount up by a factor of ten.
    const parent = numberParent();
    typeInto(parent, "1200.50");
    expect(parent.amount).toBe(1200.5);
  });

  it("keeps cents typed into a screen that stores the text", () => {
    const parent = textParent();
    typeInto(parent, "1200.50");
    expect(parseAmount(parent.text)).toBe(1200.5);
  });

  it("survives a trailing decimal point with no cents yet", () => {
    const parent = numberParent();
    typeInto(parent, "45.");
    expect(parent.amount).toBe(45);
  });

  it("keeps a leading zero entry from multiplying", () => {
    const parent = numberParent();
    typeInto(parent, "0.75");
    expect(parent.amount).toBe(0.75);
  });

  it("normalises to two decimals on blur", () => {
    const parent = textParent();
    typeInto(parent, "1200.5");
    expect(parent.text).toBe("1,200.50");
  });

  it("reads back a value it formatted earlier", () => {
    // Formatted text goes back into the field on the next edit, so the thousands
    // separator has to survive the round trip.
    const parent = textParent();
    typeInto(parent, "1200.50");
    expect(parent.text).toBe("1,200.50");
    expect(parseAmount(parent.text)).toBe(1200.5);
  });

  it("leaves unparseable text alone instead of rewriting it", () => {
    const parent = textParent();
    typeInto(parent, "12..5");
    expect(parent.text).toBe("12..5");
  });

  it("shows the parent's value when nothing has been typed", () => {
    expect(amountText(NO_DRAFT, "1,200.50")).toBe("1,200.50");
  });

  it("shows what was typed even when the parent disagrees", () => {
    const { draft } = amountTyped("1200.");
    expect(amountText(draft, "1200")).toBe("1200.");
  });

  it("hands control back to the parent on blur", () => {
    expect(amountBlurred("1200.5").draft).toBe(NO_DRAFT);
  });

  it("emits nothing for an empty field", () => {
    expect(amountBlurred("").emit).toBeNull();
  });
});
