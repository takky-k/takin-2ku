import type { AppDB } from "./db";
import { emptyWellness, saveWellness } from "./wellness";
const memory = new Map<string, string>();
const key = (db: AppDB, id: string) =>
  `takin-body-weight-draft:${db.name}:${id}`;
export function readBodyWeightDraft(db: AppDB, id: string): string | null {
  try {
    return localStorage.getItem(key(db, id)) ?? memory.get(key(db, id)) ?? null;
  } catch {
    return memory.get(key(db, id)) ?? null;
  }
}
export function stageBodyWeight(db: AppDB, id: string, raw: string) {
  memory.set(key(db, id), raw);
  try {
    localStorage.setItem(key(db, id), raw);
  } catch {
    /* Keep the current page's draft. */
  }
}
export function clearBodyWeightDraft(db: AppDB, id: string) {
  memory.delete(key(db, id));
  try {
    localStorage.removeItem(key(db, id));
  } catch {
    /* A replay is idempotent. */
  }
}
// Called inside finishWorkout's transaction, so body weight and all sets are
// committed together. Retain the journal until that outer transaction succeeds.
export async function commitBodyWeightDraft(
  db: AppDB,
  id: string,
  day: string,
) {
  const raw = readBodyWeightDraft(db, id);
  if (raw === null) return;
  const kg = raw.trim() ? Number(raw) : null;
  if (kg !== null && (!Number.isFinite(kg) || kg <= 0 || kg > 500))
    throw Error("体重は0より大きく500kg以下で入力してください。");
  const existing = (
    await db.wellness
      .where("sessionId")
      .equals(id)
      .filter((w) => !w.deletedAt)
      .toArray()
  ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (kg === null && !existing) return;
  await saveWellness(db, {
    ...(existing ?? emptyWellness(id, day)),
    bodyWeightKg: kg,
    bodyWeightUnitVersion: 1,
  });
}
