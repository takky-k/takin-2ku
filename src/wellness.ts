import { type AppDB, meta, save, revised } from "./db";
import { type Entities, localDate } from "./model";
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
