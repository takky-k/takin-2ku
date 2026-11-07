import { afterEach, describe, it, expect } from "vitest";
import Dexie from "dexie";
import {
  AppDB,
  meta,
  seed,
  save,
  revised,
  remove,
  exportBackup,
  importBackup,
  parseBackup,
} from "./db";
const opened: AppDB[] = [];
function fresh() {
  const d = new AppDB("test-" + crypto.randomUUID());
  opened.push(d);
  return d;
}
afterEach(async () => {
  for (const d of opened.splice(0)) await d.delete();
});
describe("local persistence", () => {
  it("saves and restores all data and zero RIR, queues edits/deletions offline", async () => {
    const d = fresh();
    await seed(d, true);
    const row = (await d.sets.toArray())[0];
    await save(d, "sets", revised({ ...row, rir: { min: 0, max: 0 } }));
    const second = (await d.sets.toArray())[1];
    await save(d, "sets", revised({ ...second, rir: null }));
    await remove(d, "sets", (await d.sets.toArray())[2]);
    const b = await exportBackup(d);
    d.close();
    await d.open();
    expect((await d.sets.get(row.id))?.rir).toEqual({ min: 0, max: 0 });
    const dest = fresh();
    const result = await importBackup(dest, parseBackup(JSON.stringify(b)));
    expect(result.added).toBeGreaterThan(0);
    expect(await exportBackup(dest).then((x) => x.data)).toEqual(b.data);
    expect((await importBackup(dest, b)).added).toBe(0);
    expect(await dest.queue.count()).toBe(result.added);
    expect(
      (await d.queue.toArray()).some((q) => q.operation === "delete"),
    ).toBe(true);
    await d.transaction("rw", d.tables, async () => {
      for (const table of d.tables) await table.clear();
    });
    await importBackup(d, b);
    expect((await exportBackup(d)).data).toEqual(b.data);
  });
  it("does not overwrite conflicting IDs", async () => {
    const d = fresh();
    await seed(d);
    const b = await exportBackup(d);
    b.data.exercises[0].name = "変更";
    const result = await importBackup(d, b);
    expect(result.conflicts).toBe(1);
    expect((await d.exercises.toArray())[0].name).not.toBe("変更");
  });
  it("rejects corrupt imports without partial writes", async () => {
    const d = fresh();
    await seed(d);
    const b = await exportBackup(d);
    b.data.sets.push({ id: "bad" } as never);
    await expect(importBackup(d, b)).rejects.toThrow();
    expect(await d.sets.count()).toBe(0);
  });
  it("migrates backup schema v1 scalar RIR", async () => {
    const d = fresh();
    await seed(d, true);
    const raw = JSON.parse(JSON.stringify(await exportBackup(d)));
    raw.schemaVersion = 1;
    for (const rows of Object.values(raw.data) as Record<string, unknown>[][])
      for (const r of rows) r.schemaVersion = 1;
    raw.data.sets[0].rir = 0;
    expect(parseBackup(JSON.stringify(raw)).data.sets[0].rir).toEqual({
      min: 0,
      max: 0,
    });
  });
  it("isolates demo from real data", async () => {
    const a = fresh(),
      b = fresh();
    await seed(a);
    await seed(b, true);
    expect(await a.sessions.count()).toBe(0);
    expect(await b.sessions.count()).toBe(6);
  });
});
it("upgrades an actual IndexedDB v1 database", async () => {
  const name = "migration-" + crypto.randomUUID();
  const old = new Dexie(name);
  old.version(1).stores({ sets: "id,sessionId,exerciseId" });
  await old.table("sets").add({ ...meta(), schemaVersion: 1, rir: 0 });
  old.close();
  const upgraded = new AppDB(name);
  opened.push(upgraded);
  expect((await upgraded.sets.toArray())[0].rir).toEqual({ min: 0, max: 0 });
  expect((await upgraded.sets.toArray())[0].schemaVersion).toBe(2);
});
