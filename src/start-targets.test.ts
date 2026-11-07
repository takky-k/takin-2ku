import { it, expect, afterEach } from "vitest";
import { AppDB, seed, save, revised } from "./db";
import { prepareWorkout, ConditionRequired } from "./start-targets";
import { emptyWellness, saveWellness, plannedMuscles } from "./wellness";
import { startWorkout, finishWorkout } from "./training";
import { generateRecommendations } from "./recommendations";
const opened: AppDB[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});
async function setup() {
  const db = new AppDB("targets-" + crypto.randomUUID());
  opened.push(db);
  await seed(db);
  const plans = await db.plans.toArray(),
    a = plans.find((p) => p.catalogKey === "A")!,
    b = plans.find((p) => p.catalogKey === "B")!;
  return { db, a, b };
}
async function ready(
  db: AppDB,
  plan: Awaited<ReturnType<typeof setup>>["a"],
  values: Record<string, number> = {},
) {
  const old = (await db.wellness.toArray()).find((w) => w.sessionId === null);
  await saveWellness(db, {
    ...(old ?? emptyWellness(null)),
    plannedPlanId: plan.id,
    fatigueByMuscle: {
      ...old?.fatigueByMuscle,
      ...Object.fromEntries(
        plannedMuscles(plan, await db.exercises.toArray()).map((m) => [m, 1]),
      ),
      ...values,
    },
  });
}
it("requires a saved condition for this exact menu and every planned muscle before creating a session", async () => {
  const { db, a, b } = await setup();
  await expect(prepareWorkout(db, a, "lb")).rejects.toBeInstanceOf(
    ConditionRequired,
  );
  expect(await db.sessions.count()).toBe(0);
  await ready(db, b);
  await expect(prepareWorkout(db, a, "lb")).rejects.toBeInstanceOf(
    ConditionRequired,
  );
  expect(await db.sessions.count()).toBe(0);
  await saveWellness(db, {
    ...(await db.wellness.toArray())[0],
    plannedPlanId: a.id,
    fatigueByMuscle: { 背中: 1 },
  });
  await expect(prepareWorkout(db, a, "lb")).rejects.toThrow();
  await ready(db, a);
  const id = await prepareWorkout(db, a, "lb");
  expect((await db.sessions.get(id))?.requiresTargetReview).toBe(false);
  expect(
    (await db.recommendations.toArray()).every((r) => r.status === "accepted"),
  ).toBe(true);
  expect(
    (await db.sets.toArray()).every(
      (r) => !r.completedAt && r.inputState?.reps === "",
    ),
  ).toBe(true);
});
it("switches menus by pausing drafts and restores all existing input without overwriting it", async () => {
  const { db, a, b } = await setup();
  await ready(db, a);
  const first = await prepareWorkout(db, a, "lb"),
    row = (await db.sets.where("sessionId").equals(first).toArray())[0];
  await save(
    db,
    "sets",
    revised({
      ...row,
      notes: "フォームの途中メモ",
      inputState: {
        weight: "82",
        reps: "",
        rir: "1~",
        weightTouched: true,
        repsTouched: false,
      },
    }),
  );
  const before = await db.sets.where("sessionId").equals(first).toArray();
  await ready(db, b);
  const second = await prepareWorkout(db, b, "lb");
  expect(second).not.toBe(first);
  expect((await db.sessions.get(first))?.status).toBe("paused");
  await ready(db, a);
  expect(await prepareWorkout(db, a, "lb")).toBe(first);
  expect((await db.sessions.get(second))?.status).toBe("paused");
  expect(await db.sets.where("sessionId").equals(first).toArray()).toEqual(
    before,
  );
});
it("uses latest actuals directly and ignores unrelated back fatigue on a chest day", async () => {
  const { db, b } = await setup(),
    old = await startWorkout(db, b, "lb");
  for (const row of await db.sets.where("sessionId").equals(old).toArray())
    await save(
      db,
      "sets",
      revised({
        ...row,
        reps: 8,
        rir: { min: 2, max: 2 },
        completedAt: new Date().toISOString(),
      }),
    );
  await finishWorkout(db, old);
  await ready(db, b, { 背中: 5 });
  const original = JSON.stringify(await db.plans.get(b.id)),
    id = await prepareWorkout(db, b, "lb"),
    exercise = (await db.exercises.toArray()).find(
      (e) => e.name === "新チェストプレスマシン",
    )!,
    row = (await db.sets.where("sessionId").equals(id).toArray()).find(
      (r) => r.exerciseId === exercise.id,
    )!;
  expect(row.reps).toBe(9);
  expect(row.completedAt).toBeNull();
  expect(row.inputState?.reps).toBe("");
  expect(JSON.stringify(await db.plans.get(b.id))).toBe(original);
  await ready(db, b, { 胸: 5, 背中: 1 });
  const r = (await generateRecommendations(db, id)).find(
    (r) => r.exerciseId === exercise.id,
  )!;
  expect(r.proposedTargets![0].reps).toBe(8);
  expect(r.rationale).toContain("疲労");
});
it("deduplicates simultaneous starts", async () => {
  const { db, a } = await setup();
  await ready(db, a);
  const ids = await Promise.all([
    prepareWorkout(db, a, "lb"),
    prepareWorkout(db, a, "lb"),
  ]);
  expect(ids[0]).toBe(ids[1]);
  expect(await db.sessions.count()).toBe(1);
  expect(await db.recommendations.count()).toBe(5);
});
