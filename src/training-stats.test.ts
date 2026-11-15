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
  expect(stats.finished).toHaveLength(4);
  expect(stats.weekly.sessions).toBe(3);
  expect(stats.rows).toHaveLength(4);
  expect(stats.weekDays[0].count).toBe(2);
  expect(stats.weekDays[6].label).toBe("日");
  expect(stats.weekDays[6].count).toBe(0);
  expect(workoutWeeks(stats.finished, now, 28).map((p) => p.count)).toEqual([
    0, 0, 1, 3,
  ]);
});
it("starts an empty week at Monday without fabricating records", () => {
  const stats = trainingStats([], [], new Date(2026, 10, 16, 12));
  expect(stats.weekDays[0].day).toBe("2026-11-16");
  expect(stats.rows).toEqual([]);
  expect(workoutWeeks([], now)).toHaveLength(8);
});
