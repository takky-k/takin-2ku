import type { Entities, WorkoutSet } from "./model";
export const epley = (s: WorkoutSet) =>
  s.reps >= 1 && s.reps <= 12 && s.weightKg > 0
    ? s.weightKg * (1 + s.reps / 30)
    : null;
export function weeklySummary(
  sessions: Entities["sessions"][],
  sets: WorkoutSet[],
  now = new Date(),
) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const eligible = sessions.filter(
    (s) =>
      !s.deletedAt &&
      s.status === "finished" &&
      new Date(s.startedAt) >= start &&
      new Date(s.startedAt) <= now,
  );
  const muscles: Record<string, { sets: number; frequency: number }> = {};
  for (const s of eligible) {
    const seen = new Set<string>();
    for (const row of sets.filter(
      (r) =>
        !r.deletedAt &&
        r.completedAt &&
        r.sessionId === s.id &&
        r.setType !== "warmup",
    )) {
      const muscle =
        s.exercises.find((e) => e.exerciseId === row.exerciseId)?.muscle ??
        "その他";
      muscles[muscle] ??= { sets: 0, frequency: 0 };
      muscles[muscle].sets++;
      seen.add(muscle);
    }
    for (const m of seen) muscles[m].frequency++;
  }
  return { sessions: eligible.length, muscles };
}
export function suggest(
  weight: number,
  completed: WorkoutSet[],
  pain: boolean,
  fatigue: number | null,
) {
  if (pain || (fatigue !== null && fatigue >= 4))
    return {
      weight,
      rationale:
        "痛み・強い疲労があるため増量しません。休養や負荷の軽減を検討してください。",
    };
  const ready =
    completed.length >= 3 &&
    completed.every(
      (s) =>
        s.reps >= 12 &&
        s.rir !== null &&
        s.rir.min >= 1 &&
        Math.abs(s.weightKg - weight) < 0.001 &&
        s.setType === "normal",
    );
  return ready
    ? {
        weight: Math.round(Math.min(weight * 1.025, weight + 2.5) * 100) / 100,
        rationale:
          "直近3セット以上が12回・RIR 1以上。上限2.5%かつ2.5kgで小幅な増量候補です。器具の刻みに合わせて確認してください。",
      }
    : {
        weight,
        rationale:
          "達成条件または記録が不足しています。同じ重量で再挑戦する一般ルールです。個人最適化は判断不可です。",
      };
}
export interface AdviceProvider {
  generateAdvice(
    summary: unknown,
    constraints: { maxIncreasePercent: number },
  ): Promise<unknown>;
}
export interface SyncAdapter {
  enabled: boolean;
  sync(): Promise<void>;
}
export const localOnlyAdapter: SyncAdapter = {
  enabled: false,
  async sync() {
    /* Phase 2: authentication and conflict-aware sync. No network access. */
  },
};
