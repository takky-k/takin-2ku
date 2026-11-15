import type { Entities, WorkoutSet } from "./model";
import { localDate } from "./model";
import { sessionDay } from "./training";
import { weeklySummary } from "./analysis";

export const weekStart = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
};
export const exerciseKey = (exerciseId: string, equipmentId: string) =>
  JSON.stringify([exerciseId, equipmentId]);
export function trainingStats(
  sessions: Entities["sessions"][],
  sets: WorkoutSet[],
  now = new Date(),
) {
  const finished = sessions
    .filter(
      (s) =>
        !s.deletedAt &&
        s.status === "finished" &&
        sessionDay(s) <= localDate(now),
    )
    .sort(
      (a, b) =>
        sessionDay(a).localeCompare(sessionDay(b)) ||
        (a.endedAt ?? a.startedAt).localeCompare(b.endedAt ?? b.startedAt) ||
        a.id.localeCompare(b.id),
    );
  const sessionIds = new Set(finished.map((s) => s.id));
  const rows = sets.filter(
    (r) =>
      !r.deletedAt &&
      r.completedAt &&
      r.setType !== "warmup" &&
      r.reps > 0 &&
      sessionIds.has(r.sessionId),
  );
  const weekly = weeklySummary(finished, rows, now);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = weekStart(now);
    day.setDate(day.getDate() + i);
    const key = localDate(day);
    return {
      day: key,
      label: ["月", "火", "水", "木", "金", "土", "日"][i],
      count: finished.filter((s) => sessionDay(s) === key).length,
      today: key === localDate(now),
    };
  });
  // Compare actual maximum load, then reps at that exact load, on the same
  // exercise, equipment and measurement basis. First observations aren't PRs.
  const best = new Map<
    string,
    {
      key: string;
      name: string;
      equipmentId: string;
      weightKg: number;
      reps: number;
      day: string;
      updated: boolean;
    }
  >();
  const latestId = finished.at(-1)?.id;
  for (const session of finished) {
    const current = new Map<string, WorkoutSet>();
    for (const row of rows.filter((r) => r.sessionId === session.id)) {
      const snapshot = session.exercises.find(
        (e) =>
          e.exerciseId === row.exerciseId && e.equipmentId === row.equipmentId,
      );
      if (
        !snapshot ||
        !snapshot.measurementBasis ||
        ["assisted", "bodyweight", "unknown"].includes(
          snapshot.measurementBasis,
        ) ||
        row.weightKg <= 0
      )
        continue;
      const key = JSON.stringify([
        row.exerciseId,
        row.equipmentId,
        snapshot.measurementBasis,
      ]);
      const prior = current.get(key);
      if (
        !prior ||
        row.weightKg > prior.weightKg + 0.000001 ||
        (Math.abs(row.weightKg - prior.weightKg) < 0.000001 &&
          row.reps > prior.reps)
      )
        current.set(key, row);
    }
    for (const [key, row] of current) {
      const prior = best.get(key),
        snapshot = session.exercises.find(
          (e) => e.exerciseId === row.exerciseId,
        )!;
      if (
        !prior ||
        row.weightKg > prior.weightKg + 0.000001 ||
        (Math.abs(row.weightKg - prior.weightKg) < 0.000001 &&
          row.reps > prior.reps)
      )
        best.set(key, {
          key,
          name: snapshot.name,
          equipmentId: row.equipmentId,
          weightKg: row.weightKg,
          reps: row.reps,
          day: sessionDay(session),
          updated: !!prior && session.id === latestId,
        });
    }
  }
  return {
    finished,
    rows,
    weekly,
    weekDays,
    total: finished.length,
    weeklySets: rows.filter((r) =>
      finished.some(
        (s) => s.id === r.sessionId && sessionDay(s) >= weekly.startDay,
      ),
    ).length,
    bests: [...best.values()].sort(
      (a, b) =>
        Number(b.updated) - Number(a.updated) ||
        b.day.localeCompare(a.day) ||
        a.name.localeCompare(b.name),
    ),
  };
}
export function workoutWeeks(
  sessions: Entities["sessions"][],
  now = new Date(),
  days = 0,
) {
  const last = weekStart(now),
    first = new Date(last);
  if (days > 0) first.setDate(first.getDate() - 7 * (Math.ceil(days / 7) - 1));
  else if (sessions.length) {
    const oldest = [...sessions].sort((a, b) =>
      sessionDay(a).localeCompare(sessionDay(b)),
    )[0];
    first.setTime(
      weekStart(new Date(sessionDay(oldest) + "T12:00:00")).getTime(),
    );
  } else first.setDate(first.getDate() - 49);
  const points = [];
  for (
    const date = new Date(first);
    date <= last;
    date.setDate(date.getDate() + 7)
  ) {
    const end = new Date(date);
    end.setDate(end.getDate() + 7);
    const day = localDate(date),
      endDay = localDate(end);
    points.push({
      day,
      name: day.slice(5).replace("-", "/"),
      count: sessions.filter(
        (s) => sessionDay(s) >= day && sessionDay(s) < endDay,
      ).length,
    });
  }
  return points;
}
