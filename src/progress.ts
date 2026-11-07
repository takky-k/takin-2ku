import { epley } from "./analysis";
import type { Entities, WorkoutSet } from "./model";
import { localDate, round } from "./model";
import { sessionDay } from "./training";

// Normalize each exercise/machine separately; never average raw machine loads.
export function overallProgress(
  sessions: Entities["sessions"][],
  sets: WorkoutSet[],
  now = new Date(),
) {
  const rows = new Map<string, WorkoutSet[]>();
  for (const r of sets) {
    if (
      r.deletedAt ||
      !r.completedAt ||
      r.setType === "warmup" ||
      epley(r) === null
    )
      continue;
    const group = rows.get(r.sessionId) ?? [];
    group.push(r);
    rows.set(r.sessionId, group);
  }
  const baseline = new Map<string, number>(),
    latest = new Map<string, number>(),
    appearances = new Map<string, number>();
  const byDay = new Map<
    string,
    { day: string; score: number; exercises: number; compared: number }
  >();
  for (const s of sessions
    .filter(
      (s) =>
        !s.deletedAt &&
        s.status === "finished" &&
        sessionDay(s) <= localDate(now),
    )
    .sort(
      (a, b) =>
        sessionDay(a).localeCompare(sessionDay(b)) ||
        a.startedAt.localeCompare(b.startedAt) ||
        a.id.localeCompare(b.id),
    )) {
    const current = new Map<string, number>();
    for (const r of rows.get(s.id) ?? []) {
      const snapshot = s.exercises.find((e) => e.exerciseId === r.exerciseId);
      if (
        !snapshot ||
        ["assisted", "bodyweight"].includes(snapshot.measurementBasis ?? "")
      )
        continue;
      const key = JSON.stringify([
        r.exerciseId,
        r.equipmentId,
        snapshot.measurementBasis ?? "unknown",
      ]);
      current.set(key, Math.max(current.get(key) ?? 0, epley(r)!));
    }
    if (!current.size) continue;
    for (const [key, value] of current) {
      if (!baseline.has(key)) baseline.set(key, value);
      latest.set(key, value);
      appearances.set(key, (appearances.get(key) ?? 0) + 1);
    }
    const score =
      [...latest].reduce(
        (sum, [key, value]) => sum + (value / baseline.get(key)!) * 100,
        0,
      ) / latest.size;
    byDay.set(sessionDay(s), {
      day: sessionDay(s),
      score: round(score),
      exercises: latest.size,
      compared: [...appearances.values()].filter((n) => n >= 2).length,
    });
  }
  return [...byDay.values()];
}

export function bodyWeightProgress(
  logs: Entities["wellness"][],
  targetKg: number | null,
  now = new Date(),
) {
  const byDay = new Map<string, number>();
  for (const log of logs
    .filter(
      (l) =>
        !l.deletedAt &&
        l.dateLocal <= localDate(now) &&
        l.bodyWeightKg !== null &&
        l.bodyWeightKg > 0,
    )
    .sort(
      (a, b) =>
        a.dateLocal.localeCompare(b.dateLocal) ||
        a.updatedAt.localeCompare(b.updatedAt) ||
        a.id.localeCompare(b.id),
    ))
    byDay.set(log.dateLocal, log.bodyWeightKg!);
  const first = [...byDay.values()][0];
  return [...byDay].map(([day, kg]) => ({
    day,
    kg,
    progress:
      targetKg === null
        ? null
        : round(
            first === targetKg
              ? kg === targetKg
                ? 100
                : 0
              : Math.max(
                  0,
                  Math.min(
                    100,
                    (1 - Math.abs(kg - targetKg) / Math.abs(first - targetKg)) *
                      100,
                  ),
                ),
          ),
  }));
}
