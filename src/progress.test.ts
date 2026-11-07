import { it, expect } from "vitest";
import { meta } from "./db";
import type { Entities, WorkoutSet } from "./model";
import { overallProgress, bodyWeightProgress } from "./progress";
const now = new Date("2026-11-07T12:00:00Z");
const session = (
  id: string,
  day: string,
  patch: Partial<Entities["sessions"]> = {},
): Entities["sessions"] => ({
  ...meta(),
  id,
  name: "test",
  startedAt: day + "T12:00:00Z",
  endedAt: day + "T13:00:00Z",
  performedDateLocal: day,
  status: "finished",
  planId: null,
  notes: "",
  exercises: [
    {
      exerciseId: "e",
      equipmentId: "machine",
      name: "test",
      muscle: "胸",
      notes: "",
      measurementBasis: "total",
    },
  ],
  ...patch,
});
const row = (
  sessionId: string,
  weightKg: number,
  patch: Partial<WorkoutSet> = {},
): WorkoutSet => ({
  ...meta(),
  sessionId,
  exerciseId: "e",
  equipmentId: "machine",
  weightKg,
  reps: 10,
  rir: null,
  rpe: null,
  ordinal: 0,
  setType: "normal",
  completedAt: "2026-11-07T12:00:00Z",
  notes: "",
  restSeconds: null,
  ...patch,
});
const log = (
  dateLocal: string,
  bodyWeightKg: number | null,
  patch: Partial<Entities["wellness"]> = {},
): Entities["wellness"] => ({
  ...meta(),
  sessionId: null,
  dateLocal,
  bodyWeightKg,
  sleepHours: null,
  mood: null,
  fatigue: null,
  painFlag: false,
  sorenessByMuscle: {},
  notes: "",
  ...patch,
});
it("normalizes loads per machine, weights each equally, and uses one best set per session", () => {
  const sessions = [
    session("a", "2026-11-01"),
    session("b", "2026-11-02"),
    session("c", "2026-11-03"),
  ];
  const sets = [
    row("a", 50),
    row("a", 40),
    row("b", 55),
    row("c", 200, { equipmentId: "different" }),
  ];
  const points = overallProgress(sessions, sets, now);
  expect(points.map((p) => p.score)).toEqual([100, 110, 105]);
  expect(points.at(-1)).toMatchObject({ exercises: 2, compared: 1 });
});
it("excludes deleted, unfinished, future, warmup, assisted and extreme-rep samples", () => {
  const sessions = [
    session("a", "2026-11-01"),
    session("deleted", "2026-11-02", { deletedAt: now.toISOString() }),
    session("active", "2026-11-03", { status: "active" }),
    session("future", "2027-01-01"),
    session("assist", "2026-11-04", {
      exercises: [
        {
          exerciseId: "e",
          equipmentId: "machine",
          name: "test",
          muscle: "胸",
          notes: "",
          measurementBasis: "assisted",
        },
      ],
    }),
  ];
  const sets = sessions.map((s) => row(s.id, 50));
  sets.push(
    row("a", 999, { setType: "warmup" }),
    row("a", 999, { completedAt: null }),
    row("a", 999, { deletedAt: now.toISOString() }),
    row("a", 999, { reps: 13 }),
  );
  expect(overallProgress(sessions, sets, now)).toEqual([
    { day: "2026-11-01", score: 100, exercises: 1, compared: 0 },
  ]);
});
it("uses chronological baselines and collapses multiple sessions on the same day", () => {
  expect(
    overallProgress(
      [session("b", "2026-11-01"), session("a", "2026-11-01")],
      [row("a", 50), row("b", 55)],
      now,
    ),
  ).toEqual([{ day: "2026-11-01", score: 110, exercises: 1, compared: 1 }]);
  expect(overallProgress([], [], now)).toEqual([]);
});
it("measures gain and loss goal progress, decreases when moving away or overshooting", () => {
  expect(
    bodyWeightProgress(
      [
        log("2026-11-01", 80),
        log("2026-11-02", 75),
        log("2026-11-03", 70),
        log("2026-11-04", 65),
      ],
      70,
      now,
    ).map((p) => p.progress),
  ).toEqual([0, 50, 100, 50]);
  expect(
    bodyWeightProgress(
      [log("2026-11-01", 60), log("2026-11-02", 65), log("2026-11-03", 58)],
      70,
      now,
    ).map((p) => p.progress),
  ).toEqual([0, 50, 0]);
});
it("does not fabricate a target or measurements and handles a target already reached", () => {
  expect(bodyWeightProgress([], 70, now)).toEqual([]);
  expect(
    bodyWeightProgress([log("2026-11-01", 70)], null, now)[0].progress,
  ).toBeNull();
  expect(
    bodyWeightProgress(
      [log("2026-11-01", 70), log("2026-11-02", 71)],
      70,
      now,
    ).map((p) => p.progress),
  ).toEqual([100, 0]);
  expect(
    bodyWeightProgress(
      [
        log("2026-11-01", null),
        log("2027-01-01", 70),
        log("2026-11-02", 70, { deletedAt: now.toISOString() }),
      ],
      70,
      now,
    ),
  ).toEqual([]);
});
