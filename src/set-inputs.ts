import { type AppDB, save, revised } from "./db";
import { type WorkoutSet, setSchema } from "./model";
import { z } from "zod";
export type SetInputs = Pick<
  WorkoutSet,
  | "weightKg"
  | "reps"
  | "rir"
  | "rirRaw"
  | "rirConfidence"
  | "inputUnit"
  | "inputWeight"
> &
  Partial<Pick<WorkoutSet, "completedAt">>;
interface Pending {
  id: string;
  token: string;
  patch: SetInputs;
  base: Record<string, unknown>;
}
const patchSchema = setSchema
  .pick({
    weightKg: true,
    reps: true,
    rir: true,
    rirRaw: true,
    rirConfidence: true,
    inputUnit: true,
    inputWeight: true,
    completedAt: true,
  })
  .partial({ completedAt: true })
  .strict();
const pendingSchema = z
  .object({
    id: z.string().min(1),
    token: z.string().min(1),
    patch: patchSchema,
    base: z.record(z.string(), z.unknown()),
  })
  .strict();
const prefix = (db: AppDB) => `takin-pending-set:${db.name}:`;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
async function apply(db: AppDB, pending: Pending, recovering = false) {
  await db.transaction("rw", [db.sets, db.queue], async () => {
    const row = await db.sets.get(pending.id);
    if (!row || row.deletedAt) return;
    if (recovering) {
      for (const key of Object.keys(pending.patch)) {
        const current = (row as unknown as Record<string, unknown>)[key];
        if (
          !same(current, pending.base[key]) &&
          !same(
            current,
            (pending.patch as unknown as Record<string, unknown>)[key],
          )
        )
          throw Error(
            "保存途中のセット入力が別の編集と競合しています。入力内容を確認してください。",
          );
      }
    }
    await save(
      db,
      "sets",
      revised(setSchema.parse({ ...row, ...pending.patch })),
    );
  });
  try {
    const key = prefix(db) + pending.id;
    const current = localStorage.getItem(key);
    if (current && JSON.parse(current).token === pending.token)
      localStorage.removeItem(key);
  } catch {
    /* DB write already succeeded. */
  }
}
export async function saveSetInputs(
  db: AppDB,
  row: WorkoutSet,
  patch: SetInputs,
) {
  const key = prefix(db) + row.id;
  let previous: Pending | undefined;
  try {
    const text = localStorage.getItem(key);
    if (text) previous = pendingSchema.parse(JSON.parse(text));
  } catch {
    /* IndexedDB remains usable without localStorage. */
  }
  const merged = { ...previous?.patch, ...patch },
    base = {
      ...Object.fromEntries(
        Object.keys(merged).map((k) => [
          k,
          (row as unknown as Record<string, unknown>)[k],
        ]),
      ),
      ...previous?.base,
    };
  setSchema.parse({ ...row, ...merged });
  const pending: Pending = {
    id: row.id,
    token: crypto.randomUUID(),
    patch: merged,
    base,
  };
  try {
    localStorage.setItem(key, JSON.stringify(pending));
  } catch {
    /* Continue with primary IndexedDB storage. */
  }
  await apply(db, pending);
}
export async function restorePendingSetInputs(
  db: AppDB,
  onlyIds?: Set<string>,
) {
  let keys: string[];
  try {
    keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix(db)));
  } catch {
    return;
  }
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const pending = pendingSchema.parse(JSON.parse(raw));
    if (onlyIds && !onlyIds.has(pending.id)) continue;
    if (key !== prefix(db) + pending.id)
      throw Error("保存途中のセットIDが一致しません");
    await apply(db, pending, true);
  }
}
