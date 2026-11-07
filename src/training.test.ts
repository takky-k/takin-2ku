import { it, expect, afterEach } from "vitest";
import {
  AppDB,
  seed,
  meta,
  save,
  revised,
  exportBackup,
  parseBackup,
} from "./db";
import { startWorkout, comparison, finishWorkout } from "./training";
import { localDate } from "./model";
import {
  generateRecommendations,
  decideRecommendation,
  largeReduction,
} from "./recommendations";
const opened: AppDB[] = [];
async function setup() {
  const d = new AppDB("training-" + crypto.randomUUID());
  opened.push(d);
  await seed(d);
  const p = (await d.plans.toArray()).find((p) => p.catalogKey === "A")!;
  return { d, p };
}
afterEach(async () => {
  for (const d of opened.splice(0)) await d.delete();
});
it("seeds exact A/B planned sets, no real history or legs, defaults to lb and four days", async () => {
  const { d, p } = await setup();
  expect(p.exercises.reduce((n, e) => n + e.targetSets, 0)).toBe(13);
  const b = (await d.plans.toArray()).find((p) => p.catalogKey === "B")!;
  expect(b.exercises.reduce((n, e) => n + e.targetSets, 0)).toBe(12);
  expect(
    p.exercises[0].plannedSets?.map((s) => [s.inputWeight, s.reps]),
  ).toEqual([
    [100, 8],
    [100, 7],
    [90, 8],
  ]);
  expect((await d.exercises.toArray()).some((e) => e.muscle === "脚")).toBe(
    false,
  );
  expect(await d.sessions.count()).toBe(0);
  expect((await d.profiles.get("main"))?.targetDaysPerWeek).toBe(4);
});
it("starts atomically with null actual RIR and separate target RIR and rest", async () => {
  const { d, p } = await setup();
  const ids = await Promise.all([
    startWorkout(d, p, "lb"),
    startWorkout(d, p, "lb"),
  ]);
  expect(ids[0]).toBe(ids[1]);
  expect(await d.sessions.count()).toBe(1);
  const sets = await d.sets.toArray();
  expect(sets).toHaveLength(13);
  expect(sets.every((s) => s.rir === null && s.targetRir?.min === 2)).toBe(
    true,
  );
  expect(
    sets.find((s) => s.exerciseId === p.exercises[0].exerciseId)?.restSeconds,
  ).toBe(180);
});
it("approves only session targets, never template or completed sets, and rejects stale approvals", async () => {
  const { d, p } = await setup();
  const id = await startWorkout(d, p, "lb");
  const original = JSON.stringify(await d.plans.get(p.id));
  const r = (await generateRecommendations(d, id))[0];
  const before = await d.sets.get(r.proposedTargets![0].setId);
  expect(before?.revision).toBe(r.setRevisions![before!.id]);
  await decideRecommendation(d, r.id, true);
  expect((await d.recommendations.get(r.id))?.status).toBe("accepted");
  expect(JSON.stringify(await d.plans.get(p.id))).toBe(original);
  await expect(decideRecommendation(d, r.id, true)).rejects.toThrow();
  const r2 = (await generateRecommendations(d, id))[0];
  const set = (await d.sets.get(r2.proposedTargets![0].setId))!;
  await save(
    d,
    "sets",
    revised({ ...set, completedAt: new Date().toISOString(), rir: null }),
  );
  await expect(decideRecommendation(d, r2.id, true)).rejects.toThrow("変更");
  expect((await d.sets.get(set.id))?.rir).toBeNull();
});
it("keeps same-machine comparison separate and finds previous-week same weekday", async () => {
  const { d, p } = await setup();
  await seed(d, true);
  const id = await startWorkout(d, p, "lb"),
    session = (await d.sessions.get(id))!;
  const e = session.exercises[0],
    row = (await d.sets.where("sessionId").equals(id).toArray()).find(
      (r) => r.exerciseId === e.exerciseId,
    )!;
  const at = new Date("2026-09-17T12:00:00"),
    prior = {
      ...session,
      ...meta(),
      status: "finished" as const,
      startedAt: "2026-09-10T12:00:00.000Z",
      performedDateLocal: "2026-09-10",
    };
  const set = {
    ...row,
    ...meta(),
    sessionId: prior.id,
    completedAt: prior.startedAt,
  };
  expect(
    comparison([prior], [set], e.exerciseId, e.equipmentId, at).sameSlot?.id,
  ).toBe(prior.id);
  expect(
    comparison(
      [prior],
      [{ ...set, equipmentId: "別の機器" }],
      e.exerciseId,
      e.equipmentId,
      at,
    ).previous,
  ).toBeUndefined();
});
it("migrates v2 JSON without losing existing records", async () => {
  const { d } = await setup();
  const b = JSON.parse(JSON.stringify(await exportBackup(d)));
  b.schemaVersion = 2;
  delete b.data.importRows;
  delete b.data.importBatches;
  for (const rows of Object.values(b.data) as { schemaVersion: number }[][])
    for (const r of rows) r.schemaVersion = 2;
  const migrated = parseBackup(JSON.stringify(b));
  expect(migrated.schemaVersion).toBe(3);
  expect(migrated.data.plans).toHaveLength(2);
  expect(migrated.data.importRows).toEqual([]);
});
it("flags large reductions without calling them medical thresholds", () => {
  expect(largeReduction(100, 89, 10, 7).review).toBe(true);
  expect(largeReduction(100, 90, 10, 8).review).toBe(false);
});
it("rechecks new pain before approval, preserves null wellness, and keeps fixed shrug locked", async () => {
  const { d, p } = await setup();
  const previous = await startWorkout(d, p, "lb");
  for (const row of await d.sets.where("sessionId").equals(previous).toArray())
    await save(
      d,
      "sets",
      revised({
        ...row,
        rir: { min: 2, max: 2 },
        completedAt: new Date().toISOString(),
      }),
    );
  await finishWorkout(d, previous);
  const id = await startWorkout(d, p, "lb"),
    recommendations = await generateRecommendations(d, id);
  const r = recommendations.find(
    (r) => r.exerciseId === p.exercises[0].exerciseId,
  )!;
  const original = (await d.sets.get(r.proposedTargets![0].setId))!;
  expect(r.proposedTargets![0].reps).toBe(original.reps + 1);
  const shrug = recommendations.find(
    (r) => r.exerciseId === p.exercises[4].exerciseId,
  )!;
  expect(shrug.proposedTargets![0].reps).toBe(15);
  await save(d, "wellness", {
    ...meta(),
    sessionId: null,
    dateLocal: localDate(),
    sleepHours: null,
    mood: null,
    fatigue: null,
    sorenessByMuscle: {},
    painFlag: true,
    bodyWeightKg: null,
    notes: "",
  });
  await expect(decideRecommendation(d, r.id, true)).rejects.toThrow("痛み");
  expect((await d.sets.get(original.id))?.reps).toBe(original.reps);
  const updated = await generateRecommendations(d, id);
  expect(
    updated.find((x) => x.exerciseId === r.exerciseId)!.proposedTargets![0]
      .reps,
  ).toBe(original.reps);
  expect((await d.wellness.toArray())[0].fatigue).toBeNull();
});
