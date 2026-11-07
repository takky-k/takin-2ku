import { it, expect } from "vitest";
import { encodeWorkoutCode, decodeWorkoutCode } from "./workout-code";
it("round trips private UTF8 JSON locally without URL or network transfer", async () => {
  const raw = JSON.stringify({
    name: "合成データ",
    rir: { min: 0, max: 1 },
    reps: 8,
  });
  const code = await encodeWorkoutCode(raw);
  expect(code.startsWith("t2w1.")).toBe(true);
  expect(await decodeWorkoutCode(code)).toBe(raw);
  expect(await decodeWorkoutCode(raw)).toBe(raw);
});
it("rejects invalid codes and oversized JSON", async () => {
  await expect(decodeWorkoutCode("https://invalid.test")).rejects.toThrow();
  await expect(decodeWorkoutCode("t2w1.aaaa")).rejects.toThrow();
  await expect(decodeWorkoutCode("{" + "a".repeat(5_000_001))).rejects.toThrow(
    "大きすぎ",
  );
});
