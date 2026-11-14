import { it, expect, afterEach } from "vitest";
import Dexie from "dexie";
import { AppDB, seed, exportBackup, importBackup } from "./db";
import { emptyWellness } from "./wellness";
import { displayToKg } from "./model";
import { correctLegacyBodyWeights } from "./body-weight";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { WellnessForm } from "./WellnessForm";
const opened: AppDB[] = [];
afterEach(async () => {
  cleanup();
  for (const db of opened.splice(0)) await db.delete();
});
function fresh() {
  const db = new AppDB("body-" + crypto.randomUUID());
  opened.push(db);
  return db;
}
it("saves and restores kg body weight while training loads remain lb", async () => {
  const db = fresh();
  await seed(db);
  const view = render(
    <WellnessForm database={db} unit="lb" health={[]} sessionId="s" bodyOnly />,
  );
  fireEvent.change(screen.getByLabelText("体重 (kg)"), {
    target: { value: "70.5" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(async () =>
    expect((await db.wellness.toArray())[0]?.bodyWeightKg).toBe(70.5),
  );
  const saved = (await db.wellness.toArray())[0];
  expect(saved.bodyWeightUnitVersion).toBe(1);
  expect((await db.profiles.get("main"))?.units).toBe("lb");
  view.unmount();
  render(
    <WellnessForm
      database={db}
      unit="lb"
      health={[]}
      sessionId="s"
      existing={saved}
      bodyOnly
    />,
  );
  expect(screen.getByLabelText("体重 (kg)")).toHaveValue(70.5);
});
it("upgrades actual v4 storage and imports legacy backups exactly once, preserving originals", async () => {
  const db = fresh();
  await seed(db);
  const profile = (await db.profiles.get("main"))!;
  delete profile.bodyWeightUnitVersion;
  profile.targetWeightKg = displayToKg(65, "lb");
  const log = { ...emptyWellness("s"), bodyWeightKg: displayToKg(70, "lb") };
  delete log.bodyWeightUnitVersion;
  const backup = await exportBackup(db);
  backup.data.profiles = [profile];
  backup.data.wellness = [log];
  // Simulate the previous database version, so the real schema upgrade runs.
  const name = db.name;
  await db.delete();
  const old = new Dexie(name);
  old.version(4).stores({ profiles: "id", wellness: "id,sessionId,dateLocal" });
  await old.table("profiles").put(profile);
  await old.table("wellness").put(log);
  old.close();
  await db.open();
  const migrated = (await db.wellness.get(log.id))!;
  expect(migrated.bodyWeightKg).toBeCloseTo(70);
  expect(migrated.legacyBodyWeightKg).toBe(log.bodyWeightKg);
  expect((await db.profiles.get("main"))?.targetWeightKg).toBeCloseTo(65);
  db.close();
  await db.open();
  expect((await db.wellness.get(log.id))?.bodyWeightKg).toBeCloseTo(70);
  const target = fresh();
  await importBackup(target, backup);
  expect((await target.wellness.get(log.id))?.bodyWeightKg).toBeCloseTo(70);
  expect(
    (await importBackup(target, await exportBackup(target))).conflicts,
  ).toBe(0);
});
it("does not reconvert kg profiles, new kg entries or external kg measurements", async () => {
  const db = fresh();
  await seed(db);
  const profile = (await db.profiles.get("main"))!;
  const logs = [
    {
      ...emptyWellness("s"),
      bodyWeightKg: 70,
      bodyWeightUnitVersion: 1 as const,
    },
    { ...emptyWellness("s"), source: "external", bodyWeightKg: 71 },
  ];
  correctLegacyBodyWeights([profile], logs);
  correctLegacyBodyWeights([profile], logs);
  expect(logs.map((l) => l.bodyWeightKg)).toEqual([70, 71]);
  delete profile.bodyWeightUnitVersion;
  profile.units = "kg";
  const kg = { ...emptyWellness("s"), bodyWeightKg: 72 };
  correctLegacyBodyWeights([profile], [kg]);
  expect(kg.bodyWeightKg).toBe(72);
});
