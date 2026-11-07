import { it, expect, afterEach } from "vitest";
import { AppDB } from "./db";
import { importHealth, parseHealthJson, sleepHoursForDate } from "./health";
const opened: AppDB[] = [];
afterEach(async () => {
  for (const d of opened.splice(0)) await d.delete();
});
const sample = {
  type: "sleep" as const,
  startAt: "2026-01-01T23:00:00+09:00",
  endAt: "2026-01-02T06:00:00+09:00",
  dateLocal: "2026-01-02",
  stage: "asleep" as const,
  source: "Synthetic device",
};
it("imports only validated read-only sleep intervals and deduplicates", async () => {
  const db = new AppDB("health-" + crypto.randomUUID());
  opened.push(db);
  const payload = {
    app: "takin-2ku-health" as const,
    schemaVersion: 1 as const,
    samples: [sample],
  };
  expect(await importHealth(db, payload)).toEqual({ added: 1, duplicates: 0 });
  expect(await importHealth(db, payload)).toEqual({ added: 0, duplicates: 1 });
  expect(sleepHoursForDate(await db.health.toArray(), "2026-01-02")).toBe(7);
  expect(sleepHoursForDate(await db.health.toArray(), "2026-01-03")).toBeNull();
});
it("merges overlapping sleep stages instead of adding in-bed and awake time", async () => {
  const db = new AppDB("health-" + crypto.randomUUID());
  opened.push(db);
  await importHealth(db, {
    app: "takin-2ku-health",
    schemaVersion: 1,
    samples: [
      sample,
      { ...sample, stage: "inBed" },
      { ...sample, stage: "awake" },
      {
        ...sample,
        stage: "deep",
        startAt: "2026-01-02T01:00:00+09:00",
        endAt: "2026-01-02T02:00:00+09:00",
      },
    ],
  });
  expect(sleepHoursForDate(await db.health.toArray(), "2026-01-02")).toBe(7);
});
it("does not invent missing measurements and rejects invalid intervals and non-sleep writes", () => {
  expect(sleepHoursForDate([], "2026-01-02")).toBeNull();
  expect(() =>
    parseHealthJson(
      JSON.stringify({
        app: "takin-2ku-health",
        schemaVersion: 1,
        samples: [{ ...sample, endAt: sample.startAt }],
      }),
    ),
  ).toThrow();
  expect(() =>
    parseHealthJson(
      JSON.stringify({
        app: "takin-2ku-health",
        schemaVersion: 1,
        samples: [{ ...sample, type: "workout" }],
      }),
    ),
  ).toThrow();
});
