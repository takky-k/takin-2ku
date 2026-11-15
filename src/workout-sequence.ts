import { type Entities, localDate } from "./model";
import { sessionDay } from "./training";

export function workoutSequence(
  plans: Entities["plans"][],
  sessions: Entities["sessions"][],
  today = localDate(),
) {
  const keyFor = (s: Entities["sessions"]) => {
    const key = plans.find((p) => p.id === s.planId)?.catalogKey ?? s.slotLabel;
    return key === "A" || key === "B"
      ? key
      : s.name.match(/^([AB])(?:[｜|\s]|$)/)?.[1];
  };
  const ordered = sessions
    .filter((s) => !s.deletedAt && sessionDay(s) <= today)
    .sort(
      (a, b) =>
        sessionDay(b).localeCompare(sessionDay(a)) ||
        (b.endedAt ?? b.startedAt).localeCompare(a.endedAt ?? a.startedAt) ||
        b.id.localeCompare(a.id),
    );
  const previous = ordered.find((s) => s.status === "finished" && keyFor(s));
  const previousKey = previous ? keyFor(previous) : undefined;
  const current = ordered.find(
    (s) =>
      s.status === "active" &&
      sessionDay(s) === today &&
      plans.some((p) => !p.deletedAt && p.id === s.planId),
  );
  const nextKey = previousKey === "A" ? "B" : "A";
  return {
    previous,
    previousKey,
    planId:
      current?.planId ??
      plans.find((p) => !p.deletedAt && p.catalogKey === nextKey)?.id,
  };
}
