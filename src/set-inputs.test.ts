import { it, expect, afterEach } from "vitest";
import { AppDB, seed, save, revised, remove } from "./db";
import { startWorkout } from "./training";
import { finishWorkout } from "./training";
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
it("flushes rapid local edits before finishing without a false recovery conflict", async () => {
  const { db, row } = await fixture();
  const patch: SetInputs = {
    weightKg: row.weightKg,
    reps: 8,
    rir: { min: 0, max: 0 },
    rirRaw: "0",
    rirConfidence: "exact",
    inputUnit: row.inputUnit,
    inputWeight: row.inputWeight,
    completedAt: new Date().toISOString(),
  };
  const first = saveSetInputs(db, row, patch),
    second = saveSetInputs(db, row, {
      ...patch,
      rir: { min: 1, max: 2 },
      rirRaw: "1~2",
      rirConfidence: "range",
      completedAt: new Date(Date.now() + 1).toISOString(),
    });
  await finishWorkout(db, row.sessionId);
  await Promise.all([first, second]);
  expect((await db.sessions.get(row.sessionId))?.status).toBe("finished");
  expect((await db.sets.get(row.id))?.rir).toEqual({ min: 1, max: 2 });
});
it("recovers after an interrupted burst whose earlier authored value already reached IndexedDB", async () => {
  const { db, row } = await fixture(),
    a: SetInputs = {
      weightKg: row.weightKg,
      reps: 8,
      rir: { min: 0, max: 0 },
      rirRaw: "0",
      rirConfidence: "exact",
      inputUnit: row.inputUnit,
      inputWeight: row.inputWeight,
      completedAt: "2026-01-01T00:00:00.000Z",
    },
    b: SetInputs = {
      ...a,
      rir: { min: 1, max: 2 },
      rirRaw: "1~2",
      rirConfidence: "range",
      completedAt: "2026-01-01T00:00:00.001Z",
    };
  await save(db, "sets", revised({ ...row, ...a }));
  localStorage.setItem(
    `takin-pending-set:${db.name}:${row.id}`,
    JSON.stringify({
      id: row.id,
      token: "synthetic-interrupted-burst",
      base: Object.fromEntries(
        Object.keys(b).map((k) => [
          k,
          (row as unknown as Record<string, unknown>)[k],
        ]),
      ),
      patch: b,
      intermediate: [a],
    }),
  );
  await restorePendingSetInputs(db);
  expect((await db.sets.get(row.id))?.rir).toEqual({ min: 1, max: 2 });
  expect(
    localStorage.getItem(`takin-pending-set:${db.name}:${row.id}`),
  ).toBeNull();
});
it("uses the last acknowledged write when live-query props still describe an older row", async () => {
  const { db, row } = await fixture(),
    a: SetInputs = {
      weightKg: row.weightKg,
      reps: 8,
      rir: { min: 0, max: 0 },
      rirRaw: "0",
      rirConfidence: "exact",
      inputUnit: row.inputUnit,
      inputWeight: row.inputWeight,
      completedAt: "2026-01-01T00:00:00.000Z",
    };
  await saveSetInputs(db, row, a);
  const fail = () => {
    throw Error("synthetic interrupted next write");
  };
  db.queue.hook("creating", fail);
  await expect(
    saveSetInputs(db, row, {
      ...a,
      reps: 9,
      rir: { min: 1, max: 2 },
      rirRaw: "1~2",
      rirConfidence: "range",
      completedAt: "2026-01-01T00:00:00.001Z",
    }),
  ).rejects.toThrow();
  db.queue.hook("creating").unsubscribe(fail);
  await restorePendingSetInputs(db);
  expect((await db.sets.get(row.id))?.reps).toBe(9);
  expect((await db.sets.get(row.id))?.rir).toEqual({ min: 1, max: 2 });
});
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
