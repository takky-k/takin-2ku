import { type AppDB, meta, save, revised } from "./db";
import { type Entities, localDate, kgToDisplay } from "./model";
import { sleepHoursForDate } from "./health";
import { comparison, sessionDay } from "./training";
export function observedIncrement(rows: Entities["sets"][]) {
  const weights = [
    ...new Set(
      rows.filter((r) => r.completedAt && !r.deletedAt).map((r) => r.weightKg),
    ),
  ].sort((a, b) => a - b);
  if (weights.length < 3) return null;
  return Math.min(
    ...weights
      .slice(1)
      .map((w, i) => w - weights[i])
      .filter((n) => n > 0.001),
  );
}
export function largeReduction(
  oldWeight: number,
  newWeight: number,
  oldReps: number,
  newReps: number,
) {
  return {
    weightPercent: oldWeight ? (newWeight / oldWeight - 1) * 100 : null,
    repsPercent: oldReps ? (newReps / oldReps - 1) * 100 : null,
    review:
      (oldWeight > 0 && newWeight < oldWeight * 0.9) ||
      (oldReps > 0 && newReps < oldReps * 0.8),
  };
}
export async function generateRecommendations(db: AppDB, sessionId: string) {
  const snapshot = await db.transaction(
    "r",
    [db.sessions, db.sets, db.exercises, db.wellness, db.health],
    async () => ({
      session: await db.sessions.get(sessionId),
      sessions: await db.sessions.toArray(),
      sets: await db.sets.toArray(),
      exercises: await db.exercises.toArray(),
      wellness: await db.wellness.toArray(),
      health: await db.health.toArray(),
    }),
  );
  const { session: s, sets, exercises, sessions } = snapshot;
  if (!s || s.deletedAt || s.status !== "active")
    throw Error("今日のメニューを開始してから提案を作成してください");
  const wellness = snapshot.wellness.filter(
      (w) => !w.deletedAt && w.dateLocal === localDate(),
    ),
    pain = wellness.some((w) => w.painFlag),
    fatigued = wellness.some(
      (w) =>
        (w.fatigue ?? 0) >= 4 ||
        Object.values(w.sorenessByMuscle).some((n) => n >= 4),
    );
  const sleepHours =
    sleepHoursForDate(snapshot.health, localDate()) ??
    wellness.find((w) => w.sleepHours !== null)?.sleepHours ??
    null;
  const shortSleep = sleepHours !== null && sleepHours < 6;
  const recommendations: Entities["recommendations"][] = [];
  for (const e of s.exercises) {
    const current = sets
      .filter(
        (r) =>
          r.sessionId === s.id &&
          r.exerciseId === e.exerciseId &&
          !r.deletedAt &&
          !r.completedAt,
      )
      .sort((a, b) => a.ordinal - b.ordinal);
    if (!current.length) continue;
    const history = comparison(
        sessions,
        sets,
        e.exerciseId,
        e.equipmentId,
        new Date(s.startedAt),
        s.id,
      ),
      exercise = exercises.find((x) => x.id === e.exerciseId),
      evidence = history.previousSets,
      increment = observedIncrement(evidence);
    const locked =
      exercise?.autoProgression === false || current.some((r) => r.isLocked);
    const proposedTargets = current.map((r, i) => {
      const previous = evidence[i];
      let weightKg = r.weightKg,
        reps = r.reps;
      // Untouched targets can follow the latest actual performance on this exact
      // machine. A manual edit or a safety restriction keeps today's target.
      if (
        previous &&
        !locked &&
        !pain &&
        !fatigued &&
        !shortSleep &&
        !r.inputState?.weightTouched &&
        !r.inputState?.repsTouched &&
        !r.rirRaw
      ) {
        weightKg = previous.weightKg;
        reps = previous.reps;
      }
      if (
        !pain &&
        !fatigued &&
        !shortSleep &&
        !locked &&
        previous &&
        previous.rir &&
        previous.rir.min >= 2 &&
        previous.reps >= reps &&
        Math.abs(previous.weightKg - weightKg) < 0.001 &&
        r.setType === "normal"
      ) {
        if (
          previous.reps >= 12 &&
          increment !== null &&
          increment <= Math.min(weightKg * 0.025, 2.5) + 0.000001
        )
          weightKg = weightKg + increment;
        else if (reps < 12) reps = Math.min(12, reps + 1);
      }
      return {
        setId: r.id,
        weightKg,
        reps,
        targetRir: r.targetRir ?? { min: 2, max: 2 },
      };
    });
    const rationale = locked
      ? "本人指定の固定セットです。重量・回数を自動変更しません。"
      : pain
        ? "痛み・体調不良の記録があるため増量しません。継続の可否を本人が確認してください。"
        : fatigued
          ? "疲労・筋肉痛が強いため増量しません。まず休憩、セット数や最終セットRIRの調整を本人が検討してください。"
          : shortSleep
            ? "取得した睡眠が6時間未満のため、今回は増加を提案しません。具体的なパフォーマンス低下量は推測しません。"
            : !evidence.length
              ? "同じ種目・同じ機器の確定した実績が不足しています。機種間の重量換算を行わず予定を維持します。"
              : "直近の同じ機器の実績と実測RIRを参照。達成できたセットのみ小幅な回数向上を候補にします。重量刻みは履歴からの推定で、根拠が少なければ増量しません。";
    recommendations.push({
      ...meta(),
      sessionId: s.id,
      sessionRevision: s.revision,
      setRevisions: Object.fromEntries(current.map((r) => [r.id, r.revision])),
      exerciseId: e.exerciseId,
      planId: s.planId ?? "",
      sourceModel: "local-rule",
      modelVersion: "2.2",
      originalWeightKg: current[0].weightKg,
      proposedWeightKg: proposedTargets[0].weightKg,
      proposedTargets,
      rationale:
        rationale +
        ` 前週同曜日：${history.sameSlot ? sessionDay(history.sameSlot) : "記録なし"}。睡眠：${sleepHours !== null ? `${Math.round(sleepHours * 60)}分（取得値）` : "未取得（補完なし）"}。`,
      evidenceIds: [
        ...evidence.map((r) => r.id),
        ...snapshot.health
          .filter((h) => !h.deletedAt && h.dateLocal === localDate())
          .map((h) => h.id),
      ],
      predictedPerformance: null,
      actualPerformance: null,
      confidence: null,
      status: "draft",
      decisionAt: null,
    });
  }
  await db.transaction("rw", [db.recommendations, db.queue], async () => {
    for (const r of recommendations) await save(db, "recommendations", r);
  });
  return recommendations;
}
export async function decideRecommendation(
  db: AppDB,
  id: string,
  accept: boolean,
) {
  await db.transaction(
    "rw",
    [
      db.recommendations,
      db.sessions,
      db.sets,
      db.wellness,
      db.health,
      db.exercises,
      db.queue,
    ],
    async () => {
      const r = await db.recommendations.get(id);
      if (!r || r.deletedAt || r.status !== "draft")
        throw Error("この提案はすでに処理されています");
      if (accept) {
        if (!r.sessionId || !r.proposedTargets || !r.setRevisions)
          throw Error("旧版の提案です。作り直してください");
        const s = await db.sessions.get(r.sessionId);
        if (
          !s ||
          s.status !== "active" ||
          s.deletedAt ||
          s.revision !== r.sessionRevision
        )
          throw Error("セッションが変更されています。提案を作り直してください");
        const exercise = await db.exercises.get(r.exerciseId),
          wellness = (await db.wellness.toArray()).filter(
            (w) => !w.deletedAt && w.dateLocal === localDate(),
          );
        const sleepHours =
          sleepHoursForDate(await db.health.toArray(), localDate()) ??
          wellness.find((w) => w.sleepHours !== null)?.sleepHours ??
          null;
        const history = comparison(
          await db.sessions.toArray(),
          await db.sets.toArray(),
          r.exerciseId,
          s.exercises.find((e) => e.exerciseId === r.exerciseId)?.equipmentId ??
            "",
          new Date(s.startedAt),
          s.id,
        ).previousSets;
        for (const target of r.proposedTargets) {
          const row = await db.sets.get(target.setId);
          if (
            !row ||
            row.deletedAt ||
            row.completedAt ||
            row.sessionId !== s.id ||
            row.exerciseId !== r.exerciseId ||
            row.revision !== r.setRevisions[row.id]
          )
            throw Error("セットが変更されています。提案を作り直してください");
          const increase =
            target.weightKg > row.weightKg + 0.000001 || target.reps > row.reps;
          const previous = history[r.proposedTargets.indexOf(target)],
            useActual =
              previous &&
              r.evidenceIds.includes(previous.id) &&
              !row.inputState?.weightTouched &&
              !row.inputState?.repsTouched &&
              !row.rirRaw;
          if (useActual && previous.updatedAt > r.createdAt)
            throw Error(
              "比較する履歴が変更されています。提案を作り直してください",
            );
          const baseWeight = useActual ? previous.weightKg : row.weightKg,
            baseReps = useActual ? previous.reps : row.reps;
          if (
            increase &&
            ((sleepHours !== null && sleepHours < 6) ||
              row.isLocked ||
              exercise?.autoProgression === false ||
              wellness.some(
                (w) =>
                  w.painFlag ||
                  (w.fatigue ?? 0) >= 4 ||
                  Object.values(w.sorenessByMuscle).some((n) => n >= 4),
              ))
          )
            throw Error(
              "固定セットまたは痛み・強い疲労があるため増加を適用しません",
            );
          if (
            target.weightKg >
              Math.min(baseWeight * 1.025, baseWeight + 2.5) + 0.000001 ||
            target.reps > baseReps + 1 ||
            target.weightKg < 0 ||
            target.reps < 0
          )
            throw Error("ローカル提案の安全上限を超えています");
          await save(
            db,
            "sets",
            revised({
              ...row,
              weightKg: target.weightKg,
              inputWeight: kgToDisplay(target.weightKg, row.inputUnit ?? "kg"),
              reps: target.reps,
              targetRir: target.targetRir,
              inputState: row.inputState
                ? {
                    ...row.inputState,
                    weight: String(
                      kgToDisplay(target.weightKg, row.inputUnit ?? "kg"),
                    ),
                  }
                : undefined,
            }),
          );
        }
      }
      await save(
        db,
        "recommendations",
        revised({
          ...r,
          status: accept ? "accepted" : "rejected",
          decisionAt: new Date().toISOString(),
        }),
      );
    },
  );
}
