import { it, expect, afterEach } from "vitest";
import {
  AppDB,
  seed,
  meta,
  save,
  exportBackup,
  importBackup,
  installDefaultPlans,
} from "./db";
import { startWorkout, finishWorkout } from "./training";
import { cleanAccidentalACopies, restoreMenuCopies } from "./menu-cleanup";
const opened: AppDB[] = [];
it("retires legacy default shrugs across updates, reinstalls and backups while preserving finished history and custom menus", async () => {
  const db = new AppDB("retired-" + crypto.randomUUID());
  opened.push(db);
  await seed(db);
  const a = (await db.plans.toArray()).find((p) => p.catalogKey === "A")!;
  const template = (await db.exercises.toArray())[0];
  const shrug = {
    ...template,
    ...meta(),
    source: "default-v2.1",
    name: "ダンベルシュラッグ",
  };
  await save(db, "exercises", shrug);
  const legacy = {
    ...a,
    exercises: [...a.exercises, { ...a.exercises[0], exerciseId: shrug.id }],
  };
  await save(db, "plans", legacy);
  const historyId = await startWorkout(db, legacy, "lb");
  await finishWorkout(db, historyId);
  const history = await db.sessions.get(historyId),
    oldSets = await db.sets.where("sessionId").equals(historyId).toArray();
  const active = await startWorkout(db, legacy, "lb");
  const custom = {
    ...legacy,
    ...meta(),
    source: "manual",
    catalogKey: undefined,
    name: "Custom",
  };
  await save(db, "plans", custom);
  const backup = await exportBackup(db);
  await seed(db);
  await installDefaultPlans(db);
  await seed(db);
  expect(
    (await db.plans.get(a.id))!.exercises.some(
      (e) => e.exerciseId === shrug.id,
    ),
  ).toBe(false);
  expect(
    (await db.sessions.get(active))!.exercises.some(
      (e) => e.exerciseId === shrug.id,
    ),
  ).toBe(false);
  expect(await db.sessions.get(historyId)).toEqual(history);
  expect(await db.sets.where("sessionId").equals(historyId).toArray()).toEqual(
    oldSets,
  );
  expect((await db.plans.get(custom.id))!.exercises).toEqual(custom.exercises);
  const dest = new AppDB("retired-import-" + crypto.randomUUID());
  opened.push(dest);
  await importBackup(dest, backup);
  expect(
    (await dest.plans.get(a.id))!.exercises.some(
      (e) => e.exerciseId === shrug.id,
    ),
  ).toBe(false);
  expect(await dest.sessions.get(historyId)).toEqual(history);
});
afterEach(async () => {
  for (const d of opened.splice(0)) await d.delete();
});
it("removes only the exact unused A copy and allows an explicit restore", async () => {
  const db = new AppDB("menus-" + crypto.randomUUID());
  opened.push(db);
  await seed(db);
  const a = (await db.plans.toArray()).find((p) => p.catalogKey === "A")!;
  const copy = { ...a, ...meta(), name: a.name + " コピー" };
  await save(db, "plans", copy);
  const edited = {
    ...a,
    ...meta(),
    name: a.name + " コピー",
    dayLabel: "edited",
  };
  await save(db, "plans", edited);
  const used = { ...a, ...meta(), name: a.name + " コピー" };
  await save(db, "plans", used);
  await save(db, "sessions", {
    ...meta(),
    name: "Synthetic",
    planId: used.id,
    startedAt: new Date().toISOString(),
    endedAt: null,
    status: "active",
    notes: "",
    exercises: [],
  });
  const removed = await cleanAccidentalACopies(db);
  expect(removed.map((r) => r.id)).toEqual([copy.id]);
  expect((await db.plans.get(a.id))?.deletedAt).toBeNull();
  expect((await db.plans.get(edited.id))?.deletedAt).toBeNull();
  expect((await db.plans.get(used.id))?.deletedAt).toBeNull();
  await restoreMenuCopies(db, removed);
  expect(await cleanAccidentalACopies(db)).toHaveLength(0);
  expect((await db.plans.get(copy.id))?.deletedAt).toBeNull();
});
