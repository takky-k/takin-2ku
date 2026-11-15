import { it, expect } from "vitest";
import { meta } from "./db";
import type { Entities, WorkoutSet } from "./model";
import { trainingStats, workoutWeeks } from "./training-stats";
const session = (
  id: string,
  day: string,
  patch: Partial<Entities["sessions"]> = {},
): Entities["sessions"] => ({
  ...meta(),
  id,
  name: "A",
  planId: null,
  startedAt: day + "T12:00:00Z",
  endedAt: day + "T13:00:00Z",
  performedDateLocal: day,
  timePrecision: "date",
  status: "finished",
  exercises: [
    {
      exerciseId: "e",
      name: "Press",
      muscle: "胸",
      equipmentId: "machine",
      measurementBasis: "plateStack",
      notes: "",
    },
  ],
  notes: "",
  ...patch,
});
const row = (
  id: string,
  weightKg = 50,
  reps = 8,
  patch: Partial<WorkoutSet> = {},
): WorkoutSet => ({
  ...meta(),
  sessionId: id,
  exerciseId: "e",
  equipmentId: "machine",
  ordinal: 0,
  setType: "normal",
  weightKg,
  reps,
  rir: null,
  rpe: null,
  completedAt: "2026-11-14T12:00:00Z",
  notes: "",
  restSeconds: null,
  ...patch,
});
const now = new Date(2026, 10, 14, 14);
it("counts Monday-based sessions and performed sets, excluding drafts, deletion, future, warmup and zero reps", () => {
  const sessions = [
    session("sun", "2026-11-08"),
    session("mon", "2026-11-09"),
    session("two", "2026-11-09"),
    session("sat", "2026-11-14"),
    session("draft", "2026-11-14", { status: "active" }),
    session("deleted", "2026-11-14", { deletedAt: "2026-11-14T12:00:00Z" }),
    session("future", "2026-11-16"),
  ];
  const rows = [
    row("sun"),
    row("mon"),
    row("two"),
    row("sat"),
    row("draft"),
    row("deleted"),
    row("future"),
    row("sat", 50, 0),
    row("sat", 50, 9, { setType: "warmup" }),
    row("sat", 50, 9, { deletedAt: "2026-11-14T12:00:00Z" }),
  ];
  const stats = trainingStats(sessions, rows, now);
  expect(stats.total).toBe(4);
  expect(stats.weekly.sessions).toBe(3);
  expect(stats.weeklySets).toBe(3);
  expect(stats.weekDays[0].count).toBe(2);
  expect(stats.weekDays[6].label).toBe("日");
  expect(stats.weekDays[6].count).toBe(0);
  expect(workoutWeeks(stats.finished, now, 28).map((p) => p.count)).toEqual([
    0, 0, 1, 3,
  ]);
});
it("recognizes load and same-load rep records without counting the first observation as an update", () => {
  const first = session("a", "2026-11-09"),
    second = session("b", "2026-11-12"),
    third = session("c", "2026-11-14");
  expect(trainingStats([first], [row("a")], now).bests[0].updated).toBe(false);
  const stats = trainingStats(
    [first, second, third],
    [row("a"), row("b", 55, 6), row("c", 55, 7), row("c", 40, 20)],
    now,
  );
  expect(stats.bests).toHaveLength(1);
  expect(stats.bests[0]).toMatchObject({
    weightKg: 55,
    reps: 7,
    updated: true,
    day: "2026-11-14",
  });
  expect(
    trainingStats([first, second], [row("a", 55, 7), row("b", 55, 7)], now)
      .bests[0].updated,
  ).toBe(false);
});
it("separates machines and measurement bases and never calls assisted/unknown loads personal bests", () => {
  const a = session("a", "2026-11-09"),
    b = session("b", "2026-11-14");
  const snapshot = b.exercises[0];
  b.exercises = [
    { ...snapshot, equipmentId: "other" },
    { ...snapshot, exerciseId: "assisted", measurementBasis: "assisted" },
    { ...snapshot, exerciseId: "unknown", measurementBasis: "unknown" },
  ];
  const stats = trainingStats(
    [a, b],
    [
      row("a"),
      row("b", 100, 10, { equipmentId: "other" }),
      row("b", 100, 10, { exerciseId: "assisted" }),
      row("b", 100, 10, { exerciseId: "unknown" }),
    ],
    now,
  );
  expect(stats.bests).toHaveLength(2);
  expect(stats.bests.every((b) => !b.updated)).toBe(true);
  b.exercises = [{ ...snapshot, measurementBasis: "dumbbellEach" }];
  expect(
    trainingStats([a, b], [row("a"), row("b", 100)], now).bests,
  ).toHaveLength(2);
});
it("starts an empty week at Monday without fabricating records", () => {
  const stats = trainingStats([], [], new Date(2026, 10, 16, 12));
  expect(stats.weekDays[0].day).toBe("2026-11-16");
  expect(stats.weeklySets).toBe(0);
  expect(stats.bests).toEqual([]);
  expect(workoutWeeks([], now)).toHaveLength(8);
});
