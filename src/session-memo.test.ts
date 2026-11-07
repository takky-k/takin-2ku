import { it, expect } from "vitest";
import { meta } from "./db";
import { buildSessionMemo } from "./session-memo";
import type { Entities, WorkoutSet } from "./model";
const current: Entities["sessions"] = {
  ...meta(),
  name: "Synthetic plan",
  planId: "plan",
  startedAt: "2026-01-09T12:00:00.000Z",
  performedDateLocal: "2026-01-09",
  endedAt: null,
  status: "active",
  notes: "",
  exercises: [
    {
      exerciseId: "test",
      name: "テスト種目",
      muscle: "胸",
      equipmentId: "machine",
      notes: "",
    },
  ],
};
const history = [1, 3, 5].map((day) => ({
  ...current,
  ...meta(),
  status: "finished" as const,
  startedAt: `2026-01-0${day}T12:00:00.000Z`,
  performedDateLocal: `2026-01-0${day}`,
}));
const sets: WorkoutSet[] = history.map((s) => ({
  ...meta(),
  sessionId: s.id,
  exerciseId: "test",
  equipmentId: "machine",
  ordinal: 0,
  setType: "normal",
  weightKg: 50,
  reps: 8,
  rir: null,
  rpe: null,
  completedAt: s.startedAt,
  notes: "",
  restSeconds: 120,
}));
it("states uncertainty when history or condition is missing", () => {
  const text = buildSessionMemo(current, history.slice(0, 2), sets, []).join(
    "",
  );
  expect(text).toContain("未入力");
  expect(text).toContain("記録が不足");
  expect(text).not.toContain("停滞の可能性");
});
it("qualifies a three-session plateau instead of declaring personal optimization", () => {
  const text = buildSessionMemo(current, history, sets, []).join("");
  expect(text).toContain("停滞の可能性");
  expect(text).toContain("断定できません");
  expect(text).toContain("2026-01-05");
});
