import { it, expect, afterEach } from "vitest";
import { AppDB, seed, save, revised, exportBackup, importBackup } from "./db";
import { importWorkout, type WorkoutImport } from "./workout-import";
import { exportTrainingCsv } from "./training-export";
import { displayToKg } from "./model";
const opened: AppDB[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});
const payload: WorkoutImport = {
  app: "takin-2ku-workout",
  schemaVersion: 1,
  importId: "synthetic-workout-01",
  dateLocal: "2026-02-03",
  name: "合成テスト",
  unit: "lb",
  exercises: [
    {
      exerciseName: "ペックデック",
      sets: [
        {
          weight: 20,
          reps: 6,
          rir: { min: 1, max: 2 },
          notes: "",
          previous: { weight: 15, reps: 5, rir: { min: 0, max: 1 } },
        },
        { weight: 20, reps: 5, rir: { min: 1, max: 2 }, notes: "" },
      ],
    },
  ],
};
async function setup() {
  const db = new AppDB("workout-import-test-" + crypto.randomUUID());
  opened.push(db);
  await seed(db);
  return db;
}
it("imports atomically with existing exercise IDs, date precision, separate references and one-time deduplication", async () => {
  const db = await setup(),
    exercises = await db.exercises.count();
  expect(await importWorkout(db, payload)).toEqual({
    added: 2,
    corrected: 0,
    duplicate: false,
  });
  expect(await db.exercises.count()).toBe(exercises);
  const [session] = await db.sessions.toArray(),
    rows = (await db.sets.toArray()).sort((a, b) => a.ordinal - b.ordinal);
  expect(session.performedDateLocal).toBe(payload.dateLocal);
  expect(session.timePrecision).toBe("date");
  expect(session.endedAt).toBeNull();
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.rir?.min === 1 && r.rir.max === 2)).toBe(true);
  expect(rows[0].weightKg).toBeCloseTo(displayToKg(20, "lb"));
  expect(rows[0].referencePrevious?.weightKg).toBeCloseTo(
    displayToKg(15, "lb"),
  );
  expect((await importWorkout(db, payload)).duplicate).toBe(true);
  expect(await db.sets.count()).toBe(2);
  const backup = await exportBackup(db),
    other = await setup();
  await importBackup(other, backup);
  expect((await importWorkout(other, payload)).duplicate).toBe(true);
  expect(await other.sets.count()).toBe(2);
  const csv = await exportTrainingCsv(db);
  expect(csv).toContain("1〜2");
  expect(csv.split("\r\n")).toHaveLength(3);
});
it("repairs only RIR/reference fields on matching existing sets and preserves notes and unrelated history", async () => {
  const db = await setup();
  await importWorkout(db, payload);
  const rows = (await db.sets.toArray()).sort((a, b) => a.ordinal - b.ordinal);
  for (const row of rows)
    await save(db, "sets", revised({ ...row, rir: null, notes: "本人のメモ" }));
  await db.importBatches.clear();
  const unrelated = { ...payload, importId: "other", dateLocal: "2026-02-04" };
  await importWorkout(db, unrelated);
  expect(await importWorkout(db, payload)).toEqual({
    added: 0,
    corrected: 2,
    duplicate: false,
  });
  expect(await db.sets.count()).toBe(4);
  for (const row of rows) {
    const saved = await db.sets.get(row.id);
    expect(saved?.notes).toBe("本人のメモ");
    expect(saved?.rir).toEqual({ min: 1, max: 2 });
  }
});
it("rolls back unknown/ambiguous exercises without partial records or markers", async () => {
  const db = await setup();
  await expect(
    importWorkout(db, {
      ...payload,
      exercises: [
        ...payload.exercises,
        { exerciseName: "未登録の合成種目", sets: payload.exercises[0].sets },
      ],
    }),
  ).rejects.toThrow("既存種目");
  expect(await db.sessions.count()).toBe(0);
  expect(await db.sets.count()).toBe(0);
  expect(await db.importBatches.count()).toBe(0);
});
