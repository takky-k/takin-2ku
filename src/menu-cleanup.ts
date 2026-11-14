import { type AppDB, remove, revised, save } from "./db";
import type { Entities } from "./model";
// Retire the old default from future menus on every seed/import/install. Keep
// historical sessions and any actual or partially entered set unchanged.
export async function removeRetiredDefaultExercises(db: AppDB) {
  await db.transaction(
    "rw",
    [db.exercises, db.plans, db.sessions, db.sets, db.queue],
    async () => {
      const retired = new Set(
        (await db.exercises.toArray())
          .filter(
            (e) =>
              e.source === "default-v2.1" && e.name === "ダンベルシュラッグ",
          )
          .map((e) => e.id),
      );
      if (!retired.size) return;
      const defaultPlans = (await db.plans.toArray()).filter(
        (p) =>
          !p.deletedAt &&
          (p.source === "default-v2.1" ||
            p.catalogKey === "A" ||
            p.catalogKey === "B"),
      );
      for (const plan of defaultPlans) {
        if (plan.exercises.some((e) => retired.has(e.exerciseId)))
          await save(
            db,
            "plans",
            revised({
              ...plan,
              exercises: plan.exercises.filter(
                (e) => !retired.has(e.exerciseId),
              ),
            }),
          );
      }
      const ids = new Set(defaultPlans.map((p) => p.id));
      for (const session of (await db.sessions.toArray()).filter(
        (s) =>
          !s.deletedAt &&
          s.status !== "finished" &&
          s.planId &&
          ids.has(s.planId),
      )) {
        const removable = new Set<string>();
        for (const e of session.exercises.filter((e) =>
          retired.has(e.exerciseId),
        )) {
          const rows = await db.sets
            .where("sessionId")
            .equals(session.id)
            .filter((r) => !r.deletedAt && r.exerciseId === e.exerciseId)
            .toArray();
          if (
            e.notes ||
            rows.some(
              (r) =>
                r.completedAt ||
                r.inputState?.weightTouched ||
                r.inputState?.repsTouched ||
                r.rirRaw ||
                r.notes ||
                hasPendingDraft(db, r.id),
            )
          )
            continue;
          removable.add(e.exerciseId);
          for (const row of rows) await remove(db, "sets", row);
        }
        if (removable.size)
          await save(
            db,
            "sessions",
            revised({
              ...session,
              exercises: session.exercises.filter(
                (e) => !removable.has(e.exerciseId),
              ),
            }),
          );
      }
    },
  );
}
function hasPendingDraft(db: AppDB, id: string) {
  try {
    return [
      `takin-pending-set:${db.name}:${id}`,
      `takin-sheet-draft-${db.name}-${id}`,
      `takin-table-draft-${db.name}-${id}-lb`,
      `takin-table-draft-${db.name}-${id}-kg`,
    ].some((k) => localStorage.getItem(k) !== null);
  } catch {
    return true;
  }
}
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
