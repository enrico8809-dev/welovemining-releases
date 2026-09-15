// The editing model behind CurrencyInput.
//
// It lives here rather than inside the component so the keystroke-by-keystroke
// behaviour can be tested without a React Native renderer — this is the part
// that was wrong on the phone, so it is the part that needs a test.
//
// The rule: while a field is being typed into, it shows what was typed. Only
// once focus leaves does the parent's value take over again.
//
// Why that matters: some callers keep the amount as a number and hand back a
// string derived from it. "1200." parses to 1200 and comes back as "1200", so
// the decimal point the user just typed vanishes and the next keystroke lands in
// the rands column — every digit multiplies the amount by ten, and a price of
// R 1,200.50 becomes R 120,050.00 and then R 1,200,500.00. Holding the typed
// text here keeps every amount field honest, whatever the parent stores.

import { abs, parseAmount } from "./format";

/** The text being typed, or null when the parent's value is the truth. */
export type AmountDraft = string | null;

export const NO_DRAFT: AmountDraft = null;

/** What the field should display. */
export function amountText(draft: AmountDraft, value: string): string {
  return draft ?? value;
}

/** A keystroke. The text is held as typed and passed up unchanged. */
export function amountTyped(input: string): { draft: AmountDraft; emit: string } {
  return { draft: input, emit: input };
}

/**
 * Focus leaving. A parseable amount is normalised to `1,234.56`; anything else
 * is left exactly as the user left it, so a half-finished entry isn't silently
 * rewritten into a number they didn't mean.
 */
export function amountBlurred(text: string): { draft: AmountDraft; emit: string | null } {
  const n = parseAmount(text);
  const parseable = Number.isFinite(n) && text.trim() !== "";
  return { draft: NO_DRAFT, emit: parseable ? abs(n) : null };
}
