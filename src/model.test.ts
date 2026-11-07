import { describe, it, expect } from "vitest";
import { parseRir, formatRir, displayToKg, kgToDisplay } from "./model";
describe("RIR", () => {
  it("distinguishes zero and missing", () => {
    expect(parseRir("")).toBeNull();
    expect(parseRir("0")).toEqual({ min: 0, max: 0 });
    expect(formatRir(null)).toBe("未入力");
    expect(formatRir(parseRir("0"))).toBe("0");
  });
  it("accepts every half step and ranges", () => {
    for (let n = 0; n <= 10; n += 0.5)
      expect(parseRir(String(n))).toEqual({ min: n, max: n });
    expect(parseRir("1~2")).toEqual({ min: 1, max: 2 });
    expect(parseRir("0.5〜1.5")).toEqual({ min: 0.5, max: 1.5 });
  });
  it("rejects invalid values", () => {
    for (const value of ["-1", "11", "1.2", "2~1", "a", "1~2~3"])
      expect(() => parseRir(value)).toThrow();
  });
});
it("round trips units", () =>
  expect(displayToKg(kgToDisplay(73.25, "lb"), "lb")).toBeCloseTo(73.25, 10));
