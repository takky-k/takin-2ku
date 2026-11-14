import { it, expect } from "vitest";
import { suggest, epley, weeklySummary } from "./analysis";
import { meta } from "./db";
import type { WorkoutSet, Entities } from "./model";
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
it("counts two completed workouts by completion day, excluding active drafts and retaining date-only imports", () => {
  const stamp = (day: number) => new Date(2026, 10, day, 12).toISOString();
  const base: Entities["sessions"] = {
    ...meta(),
    name: "Synthetic",
    planId: null,
    notes: "",
    exercises: [],
    startedAt: stamp(8),
    endedAt: stamp(10),
    performedDateLocal: "2026-11-08",
    timePrecision: "timestamp",
    status: "finished",
  };
  const sessions: Entities["sessions"][] = [
    base,
    { ...base, id: "second", startedAt: stamp(12), endedAt: stamp(12) },
    { ...base, id: "current", status: "active", endedAt: null },
    { ...base, id: "paused", status: "paused", endedAt: null },
    { ...base, id: "last-week", endedAt: stamp(8) },
    { ...base, id: "date-import", timePrecision: "date", endedAt: stamp(13) },
    { ...base, id: "deleted", deletedAt: stamp(14) },
    { ...base, id: "future", endedAt: stamp(16) },
  ];
  expect(weeklySummary(sessions, [], new Date(2026, 10, 14, 13))).toMatchObject(
    { sessions: 2, startDay: "2026-11-09", endDay: "2026-11-14" },
  );
});
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
