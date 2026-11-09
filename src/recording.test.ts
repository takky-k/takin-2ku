import { it, expect, afterEach } from "vitest";
import { AppDB, seed, save, revised } from "./db";
import { startWorkout, finishWorkout, skipExerciseToday } from "./training";
import { saveSetInputs } from "./set-inputs";
const opened: AppDB[] = [];
afterEach(async () => {
  localStorage.clear();
  for (const db of opened.splice(0)) await db.delete();
});
async function setup() {
  const db = new AppDB("recording-" + crypto.randomUUID());
  opened.push(db);
  await seed(db);
  const plan = (await db.plans.toArray()).find((p) => p.catalogKey === "A")!,
    id = await startWorkout(db, plan, "lb");
  return { db, plan, id };
}
it("finishes unchanged and explicitly cleared reps using the displayed default", async () => {
  const { db, id } = await setup(),
    rows = await db.sets.where("sessionId").equals(id).toArray();
  expect(rows.every((r) => !r.completedAt)).toBe(true);
  const row = rows[0];
  await save(
    db,
    "sets",
    revised({
      ...row,
      inputState: { ...row.inputState!, repsTouched: true, reps: "" },
    }),
  );
  await finishWorkout(db, id);
  expect((await db.sets.get(row.id))?.reps).toBe(row.defaultReps);
  expect(
    (await db.sets.where("sessionId").equals(id).toArray()).every(
      (r) => r.completedAt && r.repsSource === "default",
    ),
  ).toBe(true);
});
it("skips only this session, preserves the menu and exercise catalog, and restores the exercise next time", async () => {
  const { db, plan, id } = await setup(),
    before = JSON.stringify(await db.plans.get(plan.id)),
    catalog = await db.exercises.toArray(),
    exerciseId = plan.exercises[0].exerciseId;
  await skipExerciseToday(db, id, exerciseId);
  expect(JSON.stringify(await db.plans.get(plan.id))).toBe(before);
  expect(await db.exercises.toArray()).toEqual(catalog);
  expect(
    (await db.sessions.get(id))?.exercises.some(
      (e) => e.exerciseId === exerciseId,
    ),
  ).toBe(false);
  expect(
    (await db.sets.where("sessionId").equals(id).toArray())
      .filter((r) => r.exerciseId === exerciseId)
      .every((r) => r.deletedAt),
  ).toBe(true);
  await finishWorkout(db, id);
  const next = await startWorkout(db, plan, "lb");
  expect(
    (await db.sessions.get(next))?.exercises.some(
      (e) => e.exerciseId === exerciseId,
    ),
  ).toBe(true);
  expect(
    (await db.sets.where("sessionId").equals(next).toArray()).some(
      (r) => r.exerciseId === exerciseId && !r.deletedAt,
    ),
  ).toBe(true);
});
it("journals note-only writes without replacing numeric values from a newer edit", async () => {
  const { db, id } = await setup(),
    row = (await db.sets.where("sessionId").equals(id).toArray())[0];
  await saveSetInputs(db, row, { reps: 7, rir: { min: 0, max: 0 } });
  await saveSetInputs(db, row, { notes: "フォーム確認" });
  const saved = await db.sets.get(row.id);
  expect(saved?.reps).toBe(7);
  expect(saved?.rir).toEqual({ min: 0, max: 0 });
  expect(saved?.notes).toBe("フォーム確認");
});
