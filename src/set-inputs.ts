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
  Partial<Pick<WorkoutSet, "completedAt" | "inputState" | "notes">>;
interface Pending {
  id: string;
  token: string;
  patch: SetInputs;
  base: Record<string, unknown>;
  intermediate?: SetInputs[];
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
    inputState: true,
    notes: true,
  })
  .partial({ completedAt: true, inputState: true, notes: true })
  .strict();
const pendingSchema = z
  .object({
    id: z.string().min(1),
    token: z.string().min(1),
    patch: patchSchema,
    base: z.record(z.string(), z.unknown()),
    intermediate: z.array(patchSchema).max(100).optional(),
  })
  .strict();
const prefix = (db: AppDB) => `takin-pending-set:${db.name}:`;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const inFlight = new Map<string, Set<Promise<void>>>();
// Live-query props can lag one committed write. Keep the acknowledged row as
// the next journal's baseline, before removing the preceding journal token.
const acknowledged = new Map<string, WorkoutSet>();
async function apply(db: AppDB, pending: Pending, recovering = false) {
  const committed = await db.transaction(
    "rw",
    [db.sets, db.queue],
    async () => {
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
            ) &&
            !pending.intermediate?.some((p) =>
              same(current, (p as unknown as Record<string, unknown>)[key]),
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
      return db.sets.get(pending.id);
    },
  );
  if (committed) {
    acknowledged.set(prefix(db) + pending.id, committed);
    if (acknowledged.size > 1000)
      acknowledged.delete(acknowledged.keys().next().value!);
  }
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
  const known = acknowledged.get(key);
  if (known && known.revision >= row.revision) row = known;
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
    intermediate: previous
      ? [...(previous.intermediate ?? []), previous.patch].slice(-100)
      : [],
  };
  try {
    localStorage.setItem(key, JSON.stringify(pending));
  } catch {
    /* Continue with primary IndexedDB storage. */
  }
  const write = apply(db, pending),
    active = inFlight.get(db.name) ?? new Set<Promise<void>>();
  inFlight.set(db.name, active);
  active.add(write);
  try {
    await write;
  } finally {
    active.delete(write);
    if (!active.size) inFlight.delete(db.name);
  }
}
export async function restorePendingSetInputs(
  db: AppDB,
  onlyIds?: Set<string>,
) {
  // A finish click can run while the preceding input's transaction is still
  // committing. Wait for this page's own writes before replaying its journal.
  while (inFlight.get(db.name)?.size)
    await Promise.all([...inFlight.get(db.name)!]);
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
