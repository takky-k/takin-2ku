import { it, expect, afterEach } from "vitest";
import { AppDB, seed, save, revised } from "./db";
import { prepareWorkout, approveStart } from "./StartReview";
import { emptyWellness, saveWellness } from "./wellness";
import { startWorkout, finishWorkout } from "./training";
const opened: AppDB[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});
async function setup() {
  const db = new AppDB("review-" + crypto.randomUUID());
  opened.push(db);
  await seed(db);
  const plan = (await db.plans.toArray()).find((p) => p.catalogKey === "A")!;
  return { db, plan };
}
it("handles a double start without duplicate sessions or proposal batches", async () => {
  const { db, plan } = await setup(),
    ids = await Promise.all([
      prepareWorkout(db, plan, "lb"),
      prepareWorkout(db, plan, "lb"),
    ]);
  expect(ids[0]).toBe(ids[1]);
  expect(await db.sessions.count()).toBe(1);
  expect(await db.recommendations.count()).toBe(5);
  await approveStart(db, ids[0], true);
  await prepareWorkout(db, plan, "lb");
  expect((await db.sessions.get(ids[0]))?.requiresTargetReview).toBe(false);
  expect(await db.recommendations.count()).toBe(5);
});
it("prepares history/condition-based targets, applies only on approval and keeps actual fields empty", async () => {
  const { db, plan } = await setup(),
    previous = await startWorkout(db, plan, "lb");
  for (const row of await db.sets.where("sessionId").equals(previous).toArray())
    await save(
      db,
      "sets",
      revised({
        ...row,
        weightKg: row.weightKg * 1.05,
        reps: 10,
        rir: { min: 2, max: 2 },
        completedAt: new Date().toISOString(),
      }),
    );
  await finishWorkout(db, previous);
  const original = JSON.stringify(await db.plans.get(plan.id)),
    id = await prepareWorkout(db, plan, "lb"),
    before = (await db.sets.where("sessionId").equals(id).toArray()).sort(
      (a, b) => a.ordinal - b.ordinal,
    ),
    recommendations = (await db.recommendations.toArray()).filter(
      (r) => r.sessionId === id,
    );
  expect((await db.sessions.get(id))?.requiresTargetReview).toBe(true);
  expect(recommendations).toHaveLength(5);
  expect(
    before.every(
      (r) => !r.completedAt && r.rir === null && r.inputState?.reps === "",
    ),
  ).toBe(true);
  await approveStart(db, id, true);
  expect((await db.sessions.get(id))?.requiresTargetReview).toBe(false);
  for (const r of recommendations)
    for (const target of r.proposedTargets!) {
      const saved = await db.sets.get(target.setId);
      expect(saved?.weightKg).toBe(target.weightKg);
      expect(saved?.reps).toBe(target.reps);
      expect(saved?.completedAt).toBeNull();
      expect(saved?.inputState?.reps).toBe("");
    }
  expect(JSON.stringify(await db.plans.get(plan.id))).toBe(original);
});
it("rejects the whole approval atomically if condition changes before starting", async () => {
  const { db, plan } = await setup(),
    previous = await startWorkout(db, plan, "lb");
  for (const row of await db.sets.where("sessionId").equals(previous).toArray())
    await save(
      db,
      "sets",
      revised({
        ...row,
        rir: { min: 2, max: 2 },
        completedAt: new Date().toISOString(),
      }),
    );
  await finishWorkout(db, previous);
  const id = await prepareWorkout(db, plan, "lb"),
    before = await db.sets.where("sessionId").equals(id).toArray();
  await saveWellness(db, { ...emptyWellness(null), fatigue: 5 });
  await expect(approveStart(db, id, true)).rejects.toThrow();
  expect(await db.sets.where("sessionId").equals(id).toArray()).toEqual(before);
  expect(
    (await db.recommendations.toArray()).every((r) => r.status === "draft"),
  ).toBe(true);
  expect((await db.sessions.get(id))?.requiresTargetReview).toBe(true);
  await approveStart(db, id, false);
  expect((await db.sessions.get(id))?.requiresTargetReview).toBe(false);
});
