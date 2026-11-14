import { type AppDB, meta, save, revised } from "./db";
import { type Entities, localDate } from "./model";
export function plannedMuscles(
  plan: Entities["plans"],
  exercises: Entities["exercises"][],
) {
  return [
    ...new Set(
      plan.exercises
        .map(
          (t) =>
            exercises.find((e) => e.id === t.exerciseId && !e.deletedAt)
              ?.muscle,
        )
        .filter((m): m is string => !!m),
    ),
  ];
}
export function fatigueForMuscle(
  log: Entities["wellness"],
  muscle: string,
): number | null {
  return log.fatigueByMuscle !== undefined
    ? (log.fatigueByMuscle[muscle] ?? null)
    : log.fatigue;
}
export function sorenessForMuscle(log: Entities["wellness"], muscle: string) {
  const group = muscle.includes("上腕")
    ? "腕"
    : muscle === "僧帽筋"
      ? "背中"
      : muscle.split(/[（(]/)[0];
  return log.sorenessByMuscle[muscle] ?? log.sorenessByMuscle[group] ?? null;
}
export function isMuscleFatigued(log: Entities["wellness"], muscle: string) {
  return (
    (fatigueForMuscle(log, muscle) ?? 0) >= 4 ||
    (sorenessForMuscle(log, muscle) ?? 0) >= 4
  );
}
export function emptyWellness(
  sessionId: string | null,
  date = localDate(),
): Entities["wellness"] {
  return {
    ...meta(),
    sessionId,
    dateLocal: date,
    sleepHours: null,
    mood: null,
    fatigue: null,
    painFlag: false,
    sorenessByMuscle: {},
    bodyWeightKg: null,
    bodyWeightUnitVersion: 1,
    notes: "",
    explicitInputFlags: {},
    sleepStatus: "not-acquired",
  };
}
export async function saveWellness(db: AppDB, draft: Entities["wellness"]) {
  return db.transaction("rw", [db.wellness, db.queue], async () => {
    const existing = (
      await db.wellness
        .where("dateLocal")
        .equals(draft.dateLocal)
        .filter((w) => !w.deletedAt && w.sessionId === draft.sessionId)
        .toArray()
    ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const row = {
      ...draft,
      ...(existing
        ? {
            id: existing.id,
            createdAt: existing.createdAt,
            revision: existing.revision,
          }
        : {}),
      explicitInputFlags: {
        ...draft.explicitInputFlags,
        mood: draft.mood !== null,
        fatigue: draft.fatigue !== null,
        ...Object.fromEntries(
          Object.keys(draft.fatigueByMuscle ?? {}).map((m) => [
            "fatigue:" + m,
            true,
          ]),
        ),
        bodyWeightKg: draft.bodyWeightKg !== null,
        ...Object.fromEntries(
          [
            ...new Set([
              "胸",
              "背中",
              "肩",
              "腕",
              ...Object.keys(draft.sorenessByMuscle),
            ]),
          ].map((m) => ["soreness:" + m, m in draft.sorenessByMuscle]),
        ),
      },
    };
    await save(db, "wellness", existing ? revised(row) : row);
    return (await db.wellness.get(row.id))!;
  });
}
