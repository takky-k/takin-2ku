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
  return {
    finished,
    rows,
    weekly,
    weekDays,
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
