import { describe, expect, it } from "vitest";
import { normalizeUrl } from "../api";
import { combineSeries } from "../components/Chart";
import { pct, price, signed } from "../format";

describe("combined account value", () => {
  it("adds each market's latest value once every market has reported", () => {
    const equity = {
      crypto: [["2026-10-01T00:00:00Z", 1000], ["2026-10-01T02:00:00Z", 1100]] as [string, number][],
      forex: [["2026-10-01T01:00:00Z", 10000]] as [string, number][],
    };
    const out = combineSeries(equity, ["crypto", "forex"]);
    expect(out.map((p) => p[1])).toEqual([11000, 11100]);
  });
});

describe("pairing address", () => {
  it("accepts a bare Tailscale name", () => {
    expect(normalizeUrl(" my-pc.tail1234.ts.net/ ")).toBe("https://my-pc.tail1234.ts.net");
    expect(normalizeUrl("http://127.0.0.1:8765")).toBe("http://127.0.0.1:8765");
  });
});

describe("number formatting", () => {
  it("shows signs and enough decimals for Forex", () => {
    expect(signed(-12.5)).toBe("−12.50");
    expect(pct(3.456)).toBe("+3.46%");
    expect(price(1.08534)).toBe("1.08534");
    expect(price(84195.1)).toBe("84,195.10");
  });
});
