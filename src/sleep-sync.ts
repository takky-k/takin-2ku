import { create } from "zustand";
import { type AppDB } from "./db";
import {
  parseHealthJson,
  importHealth,
  sleepHoursForDate,
  type HealthMapping,
} from "./health";
import { localDate } from "./model";
export type SleepStatus = "success" | "no-data" | "unconfigured" | "error";
export const useSleepState = create<{
  status: SleepStatus;
  hours: number | null;
  date: string;
  updating: boolean;
  lastChecked: string | null;
}>(() => ({
  status: "unconfigured",
  hours: null,
  date: localDate(),
  updating: false,
  lastChecked: null,
}));
export interface SleepConnection {
  url: string;
  token: string;
  mapping?: HealthMapping;
}
const configKey = "takin-sleep-connection";
export function readSleepConnection(): SleepConnection | null {
  try {
    const raw = localStorage.getItem(configKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function saveSleepConnection(config: SleepConnection | null) {
  if (config) {
    validateSleepUrl(config.url);
    if (!config.token.trim())
      throw Error("認証付きの取得APIを設定してください");
    localStorage.setItem(configKey, JSON.stringify(config));
  } else localStorage.removeItem(configKey);
}
export function validateSleepUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error("認証情報やクエリを含まないHTTPSの取得URLを設定してください");
  return url.toString();
}
const pending = new Map<string, Promise<void>>();
export function refreshSleep(
  db: AppDB,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const current = pending.get(db.name);
  if (current) return current;
  const task = (async () => {
    const date = localDate();
    useSleepState.setState({
      date,
      updating: true,
      ...(useSleepState.getState().date !== date ? { hours: null } : {}),
    });
    try {
      let records = await db.health.toArray(),
        hours = sleepHoursForDate(records, date);
      const config = readSleepConnection();
      let imported = false;
      try {
        imported =
          localStorage.getItem(`takin-sleep-imported:${db.name}`) === "true";
      } catch {
        /* IndexedDB is the primary source. */
      }
      const linked =
        records.some((r) => !r.deletedAt && r.type === "sleep") || imported;
      useSleepState.setState({
        hours,
        status:
          hours !== null ? "success" : linked ? "no-data" : "unconfigured",
      });
      if (config && navigator.onLine) {
        const response = await fetcher(validateSleepUrl(config.url), {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${config.token}`,
          },
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw Error("Sleep endpoint unavailable");
        const declared = Number(response.headers.get("content-length") ?? 0);
        if (declared > 5_000_000) throw Error("Response too large");
        const body = await response.text();
        if (body.length > 5_000_000) throw Error("Response too large");
        await importHealth(db, parseHealthJson(body, config.mapping));
        records = await db.health.toArray();
        hours = sleepHoursForDate(records, date);
        useSleepState.setState({
          hours,
          status: hours === null ? "no-data" : "success",
        });
      } else if (config && !navigator.onLine && hours === null)
        useSleepState.setState({ status: "error" });
      useSleepState.setState({ lastChecked: new Date().toISOString() });
    } catch {
      useSleepState.setState({ status: "error" });
    } finally {
      useSleepState.setState({ updating: false });
    }
  })();
  pending.set(db.name, task);
  void task.finally(() => {
    if (pending.get(db.name) === task) pending.delete(db.name);
  });
  return task;
}
export function sleepLabel(status: SleepStatus, hours: number | null) {
  if (status === "error") return "睡眠データを更新できませんでした";
  if (status === "unconfigured") return "睡眠データの連携が必要です";
  if (status === "no-data" || hours === null)
    return "今日の睡眠データはまだありません";
  const minutes = Math.round(hours * 60);
  return `睡眠時間：${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}
