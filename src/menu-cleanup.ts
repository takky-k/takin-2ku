import { type AppDB, remove, revised, save } from "./db";
import type { Entities } from "./model";
export async function cleanAccidentalACopies(db: AppDB) {
  const removed: Entities["plans"][] = [];
  await db.transaction("rw", [db.plans, db.sessions, db.queue], async () => {
    const plans = await db.plans.toArray(),
      original = plans.find(
        (p) =>
          !p.deletedAt &&
          p.catalogKey === "A" &&
          p.name === "A｜背中・リアデルト・二頭筋",
      );
    if (!original) return;
    for (const copy of plans) {
      if (
        copy.deletedAt ||
        copy.id === original.id ||
        copy.source === "restored-copy" ||
        copy.name !== original.name + " コピー" ||
        copy.catalogKey !== "A"
      )
        continue;
      if (
        copy.dayLabel !== original.dayLabel ||
        copy.generalNotes !== original.generalNotes ||
        JSON.stringify(copy.exercises) !== JSON.stringify(original.exercises)
      )
        continue;
      if (await db.sessions.filter((s) => s.planId === copy.id).count())
        continue;
      await remove(db, "plans", copy);
      removed.push(copy);
    }
  });
  return removed;
}
export async function restoreMenuCopies(db: AppDB, rows: Entities["plans"][]) {
  for (const row of rows) {
    const current = await db.plans.get(row.id);
    if (current?.deletedAt)
      await save(
        db,
        "plans",
        revised({ ...current, deletedAt: null, source: "restored-copy" }),
      );
  }
}
