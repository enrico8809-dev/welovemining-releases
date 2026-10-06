import {
  abs,
  fmt,
  fmtBracketed,
  fmtSigned,
  fmtUnits,
  fmtWhole,
  parseAmount,
} from "../format";

describe("rand formatting", () => {
  it("uses the specified format: R 1,234.56", () => {
    expect(fmt(1234.56)).toBe("R 1,234.56");
  });

  it("groups thousands with commas and separates cents with a point", () => {
    // Not the en-ZA locale's own convention ("1 234 567,89"), which is both the
    // wrong format for this app and unparseable by parseAmount.
    expect(abs(1234567.89)).toBe("1,234,567.89");
  });

  it("does not depend on the runtime's locale data", () => {
    const original = Number.prototype.toLocaleString;
    // A phone with no ICU data returns something quite different.
    // eslint-disable-next-line no-extend-native
    Number.prototype.toLocaleString = function () {
      return "nope";
    };
    try {
      expect(abs(1200.5)).toBe("1,200.50");
    } finally {
      Number.prototype.toLocaleString = original;
    }
  });

  it("always shows two decimals", () => {
    expect(abs(1200)).toBe("1,200.00");
    expect(abs(0)).toBe("0.00");
  });

  it("drops the sign — the caller decides how to show it", () => {
    expect(abs(-950.25)).toBe("950.25");
    expect(fmt(-950.25)).toBe("R -950.25");
    expect(fmtSigned(-950.25)).toBe("− R 950.25");
  });

  it("formats whole numbers without cents", () => {
    expect(fmtWhole(12500)).toBe("12,500");
    expect(fmtWhole(999)).toBe("999");
  });
});

describe("parsing what was typed", () => {
  it("reads back everything it formats", () => {
    // Amount fields normalise on blur and are then re-read, so a value that does
    // not survive this round trip grows every time it is edited.
    for (const n of [0, 1, 0.75, 45, 1200.5, 99999.99, 1234567.89]) {
      expect(parseAmount(abs(n))).toBeCloseTo(n, 2);
    }
  });

  it("accepts a plain number", () => {
    expect(parseAmount("1200.50")).toBe(1200.5);
  });

  it("accepts thousands separators and a stray rand symbol", () => {
    expect(parseAmount("R 1,200.50")).toBe(1200.5);
    expect(parseAmount("1,234,567.89")).toBe(1234567.89);
  });

  it("reads a decimal comma as cents, not as thousands", () => {
    // What a South African keypad offers, and how this app used to format.
    expect(parseAmount("1200,50")).toBe(1200.5);
    expect(parseAmount("1,50")).toBe(1.5);
  });

  it("reads a comma before three digits as thousands", () => {
    expect(parseAmount("1,200")).toBe(1200);
  });

  it("copes with the no-break spaces locale formatting uses", () => {
    expect(parseAmount("1 200.50")).toBe(1200.5);
    expect(parseAmount("1 200,50")).toBe(1200.5);
  });

  it("rejects anything that isn't an amount", () => {
    expect(parseAmount("twelve")).toBeNaN();
    expect(parseAmount("12..5")).toBeNaN();
    expect(parseAmount("")).toBeNaN();
  });
});

describe("fmtUnits", () => {
  it("pads a stablecoin balance to cents", () => {
    expect(fmtUnits(5399.5, 2)).toBe("5,399.50");
  });

  it("keeps bitcoin's eight places rather than rounding them away", () => {
    expect(fmtUnits(0.05263158, 8)).toBe("0.05263158");
  });

  it("groups thousands like every other figure in the app", () => {
    expect(fmtUnits(1234567.891, 2)).toBe("1,234,567.89");
  });

  it("shows whole units with no point when asked for none", () => {
    expect(fmtUnits(1200, 0)).toBe("1,200");
  });
});

describe("fmtBracketed", () => {
  it("leaves a positive figure alone", () => {
    expect(fmtBracketed(1200.5)).toBe("1,200.50");
  });

  // A loss on crypto is a negative income line. Through abs() it would print as
  // income of that size while the total it belongs to had gone down by it.
  it("brackets a negative rather than dropping the sign", () => {
    expect(fmtBracketed(-500)).toBe("(500.00)");
  });

  it("does not bracket a zero", () => {
    expect(fmtBracketed(0)).toBe("0.00");
  });
});
