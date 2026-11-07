import { it, expect, afterEach, vi } from "vitest";
import { AppDB } from "./db";
import {
  refreshSleep,
  saveSleepConnection,
  useSleepState,
  sleepLabel,
  validateSleepUrl,
} from "./sleep-sync";
import { importHealth, parseHealthJson } from "./health";
import { localDate } from "./model";
const opened: AppDB[] = [];
afterEach(async () => {
  saveSleepConnection(null);
  vi.restoreAllMocks();
  for (const d of opened.splice(0)) await d.delete();
});
const setup = () => {
  const d = new AppDB("sleep-sync-" + crypto.randomUUID());
  opened.push(d);
  return d;
};
const payload = (date = localDate()) => ({
  app: "takin-2ku-health" as const,
  schemaVersion: 1 as const,
  samples: [
    {
      type: "sleep" as const,
      source: "Synthetic QA",
      startAt: date + "T00:00:00Z",
      endAt: date + "T07:30:00Z",
      dateLocal: date,
      stage: "asleep" as const,
    },
  ],
});
it("distinguishes unconfigured, no data, success and error without replacing missing sleep with zero", async () => {
  const d = setup();
  await refreshSleep(d);
  expect(useSleepState.getState().status).toBe("unconfigured");
  expect(useSleepState.getState().hours).toBeNull();
  await importHealth(d, payload("2025-01-01"));
  await refreshSleep(d);
  expect(useSleepState.getState().status).toBe("no-data");
  await importHealth(d, payload());
  await refreshSleep(d);
  expect(useSleepState.getState().status).toBe("success");
  expect(useSleepState.getState().hours).toBe(7.5);
  expect(sleepLabel("success", 7.5)).toBe("睡眠時間：7時間30分");
  saveSleepConnection({
    url: "https://sleep.example.test/data",
    token: "synthetic-token",
  });
  await refreshSleep(d, vi.fn().mockRejectedValue(Error("unavailable")));
  expect(useSleepState.getState().status).toBe("error");
  expect(useSleepState.getState().hours).toBe(7.5);
});
it("fetches authenticated HTTPS once for concurrent resume events and deduplicates records", async () => {
  const d = setup();
  saveSleepConnection({
    url: "https://sleep.example.test/data",
    token: "synthetic-token",
  });
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(payload())),
  );
  await Promise.all([refreshSleep(d, fetcher), refreshSleep(d, fetcher)]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: { Authorization: "Bearer synthetic-token" },
  });
  await refreshSleep(d, fetcher);
  expect(await d.health.count()).toBe(1);
  expect(() => validateSleepUrl("http://insecure.test")).toThrow();
  expect(() => validateSleepUrl("https://a.test?token=x")).toThrow();
});
it("requires an explicit mapping for unknown shortcut JSON and rejects unmapped stages", () => {
  const raw = {
      data: [
        {
          from: "2026-02-01T22:00:00+09:00",
          to: "2026-02-02T06:00:00+09:00",
          kind: "睡眠",
          device: "Synthetic",
          day: "2026-02-02",
        },
      ],
    },
    mapping = {
      list: "data",
      start: "from",
      end: "to",
      stage: "kind",
      source: "device",
      date: "day",
      stageValues: { 睡眠: "asleep" as const },
    };
  expect(() => parseHealthJson(JSON.stringify(raw))).toThrow();
  expect(
    parseHealthJson(JSON.stringify(raw), mapping).samples[0].dateLocal,
  ).toBe("2026-02-02");
  expect(() =>
    parseHealthJson(JSON.stringify(raw), { ...mapping, stageValues: {} }),
  ).toThrow("未確認");
});
