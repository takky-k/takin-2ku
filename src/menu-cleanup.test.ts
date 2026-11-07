import { it, expect, afterEach } from "vitest";
import { AppDB, seed, meta, save } from "./db";
import { cleanAccidentalACopies, restoreMenuCopies } from "./menu-cleanup";
const opened: AppDB[] = [];
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
