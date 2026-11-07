import { it, expect } from "vitest";
import { suggest, epley, weeklySummary } from "./analysis";
import { meta } from "./db";
import type { WorkoutSet } from "./model";
const set: WorkoutSet = {
  ...meta(),
  sessionId: "s",
  exerciseId: "e",
  equipmentId: "machine",
  ordinal: 0,
  setType: "normal",
  weightKg: 50,
  reps: 12,
  rir: { min: 2, max: 2 },
  rpe: null,
  completedAt: new Date().toISOString(),
  notes: "",
  restSeconds: 90,
};
it("caps increase and never increases with pain, fatigue or missing RIR", () => {
  expect(suggest(50, [set, set, set], false, 2).weight).toBe(51.25);
  expect(suggest(50, [set, set, set], true, 2).weight).toBe(50);
  expect(suggest(50, [set, set, set], false, 4).weight).toBe(50);
  expect(suggest(50, [{ ...set, rir: null }, set, set], false, 2).weight).toBe(
    50,
  );
  expect(
    suggest(50, [{ ...set, rir: { min: 0, max: 0 } }, set, set], false, 2)
      .weight,
  ).toBe(50);
});
it("uses a bounded Epley reference", () => {
  expect(epley({ ...set, reps: 10 })).toBeCloseTo(66.666);
  expect(epley({ ...set, reps: 20 })).toBeNull();
  expect(epley({ ...set, reps: 0 })).toBeNull();
});
it("counts completed non-warmup sets and session frequency", () => {
  const now = new Date();
  const s = {
    ...meta(),
    id: "s",
    name: "test",
    startedAt: now.toISOString(),
    endedAt: now.toISOString(),
    status: "finished" as const,
    planId: null,
    notes: "",
    exercises: [
      {
        exerciseId: "e",
        name: "test",
        muscle: "胸",
        equipmentId: "machine",
        notes: "",
      },
    ],
  };
  expect(
    weeklySummary(
      [s],
      [set, { ...set, setType: "warmup" }, { ...set, completedAt: null }],
      now,
    ).muscles["胸"],
  ).toEqual({ sets: 1, frequency: 1 });
});
