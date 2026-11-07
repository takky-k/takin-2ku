import { it, expect, afterEach } from "vitest";
import { AppDB, seed, save, revised, remove } from "./db";
import { startWorkout } from "./training";
import {
  saveSetInputs,
  restorePendingSetInputs,
  type SetInputs,
} from "./set-inputs";
const opened: AppDB[] = [];
afterEach(async () => {
  for (const d of opened.splice(0)) await d.delete();
  localStorage.clear();
});
async function fixture() {
  const db = new AppDB("pending-" + crypto.randomUUID());
  opened.push(db);
  await seed(db);
  const plan = (await db.plans.toArray())[0];
  const id = await startWorkout(db, plan, "lb");
  return {
    db,
    row: (await db.sets.where("sessionId").equals(id).toArray())[0],
  };
}
it("journals completion before async storage and restores zero RIR after a failed write", async () => {
  const { db, row } = await fixture();
  const patch: SetInputs = {
    weightKg: row.weightKg,
    reps: row.reps,
    rir: { min: 0, max: 0 },
    rirRaw: "0",
    rirConfidence: "exact",
    inputUnit: row.inputUnit,
    inputWeight: row.inputWeight,
    completedAt: new Date().toISOString(),
  };
  const fail = () => {
    throw Error("synthetic interrupted write");
  };
  db.queue.hook("creating", fail);
  const pending = saveSetInputs(db, row, patch);
  expect(
    Object.keys(localStorage).some((k) => k.startsWith("takin-pending-set:")),
  ).toBe(true);
  await expect(pending).rejects.toThrow();
  expect((await db.sets.get(row.id))?.completedAt).toBeNull();
  db.queue.hook("creating").unsubscribe(fail);
  await restorePendingSetInputs(db);
  const result = await db.sets.get(row.id);
  expect(result?.completedAt).toBe(patch.completedAt);
  expect(result?.rir).toEqual({ min: 0, max: 0 });
  expect(
    Object.keys(localStorage).some((k) => k.startsWith("takin-pending-set:")),
  ).toBe(false);
});
it("does not resurrect a deleted set or overwrite a conflicting edit during recovery", async () => {
  const { db, row } = await fixture();
  const fail = () => {
    throw Error("test interruption");
  };
  db.queue.hook("creating", fail);
  await expect(
    saveSetInputs(db, row, {
      weightKg: row.weightKg + 1,
      reps: row.reps,
      rir: null,
      rirRaw: "",
      rirConfidence: "unknown",
      inputUnit: "kg",
      inputWeight: row.weightKg + 1,
    }),
  ).rejects.toThrow();
  db.queue.hook("creating").unsubscribe(fail);
  await save(db, "sets", revised({ ...row, weightKg: row.weightKg + 5 }));
  await expect(restorePendingSetInputs(db)).rejects.toThrow("競合");
  await remove(db, "sets", (await db.sets.get(row.id))!);
  await restorePendingSetInputs(db);
  expect((await db.sets.get(row.id))?.deletedAt).not.toBeNull();
});
it("rejects journal fields that could change set identity", async () => {
  const { db, row } = await fixture();
  const count = await db.sets.count();
  localStorage.setItem(
    `takin-pending-set:${db.name}:${row.id}`,
    JSON.stringify({
      id: row.id,
      token: "tampered",
      base: {},
      patch: { id: crypto.randomUUID(), weightKg: 10, reps: 10, rir: null },
    }),
  );
  await expect(restorePendingSetInputs(db)).rejects.toThrow();
  expect(await db.sets.count()).toBe(count);
});
