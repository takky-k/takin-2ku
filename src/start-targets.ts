import { type AppDB, save, revised } from "./db";
import { type Entities, localDate } from "./model";
import { startWorkout } from "./training";
import { plannedMuscles } from "./wellness";
import { applyOnlineAdvice } from "./online-advice";
import {
  generateRecommendations,
  decideRecommendation,
} from "./recommendations";
export class ConditionRequired extends Error {
  constructor(public planId: string) {
    super(
      "今日のメニューを選び、鍛える部位の筋肉疲労を確認して保存してください。",
    );
    this.name = "ConditionRequired";
  }
}
async function requireCondition(db: AppDB, planId: string, muscles: string[]) {
  const logs = await db.wellness
      .where("dateLocal")
      .equals(localDate())
      .filter((w) => !w.deletedAt && w.sessionId === null)
      .toArray(),
    latest = logs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (
    !latest ||
    latest.plannedPlanId !== planId ||
    !muscles.length ||
    muscles.some((m) => {
      const n = latest.fatigueByMuscle?.[m];
      return n === undefined || n < 1 || n > 5;
    })
  )
    throw new ConditionRequired(planId);
}
const preparing = new Map<string, { planId: string; task: Promise<string> }>();
export async function startFromSavedCondition(
  db: AppDB,
  saved: Entities["wellness"],
) {
  if (
    saved.sessionId !== null ||
    saved.dateLocal !== localDate() ||
    !saved.plannedPlanId
  )
    throw Error("今日のメニューを選んで保存してください。");
  const plan = await db.plans.get(saved.plannedPlanId),
    profile = await db.profiles.get("main");
  if (!plan || plan.deletedAt || !plan.exercises.length || !profile)
    throw Error("メニューまたは設定を確認してください。");
  const existing = await db.sessions
    .where("status")
    .anyOf("active", "paused")
    .filter((s) => !s.deletedAt && s.planId === plan.id)
    .first();
  const id = await prepareWorkout(db, plan, profile.units);
  if (existing?.id === id && existing.requiresTargetReview === false)
    await refreshTargets(db, id);
  await applyOnlineAdvice(db, id);
  return id;
}
export async function refreshTargets(db: AppDB, id: string) {
  const session = await db.sessions.get(id);
  if (!session || session.status !== "active" || !session.planId)
    throw Error("記録中のメニューがありません");
  await requireCondition(db, session.planId, [
    ...new Set(session.exercises.map((e) => e.muscle)),
  ]);
  const recs = await generateRecommendations(db, id);
  await db.transaction(
    "rw",
    [
      db.sessions,
      db.sets,
      db.recommendations,
      db.wellness,
      db.health,
      db.exercises,
      db.queue,
    ],
    async () => {
      await requireCondition(db, session.planId!, [
        ...new Set(session.exercises.map((e) => e.muscle)),
      ]);
      for (const r of recs) await decideRecommendation(db, r.id, true);
    },
  );
  return recs.length;
}
export function prepareWorkout(
  db: AppDB,
  plan: Entities["plans"],
  unit: "kg" | "lb",
): Promise<string> {
  const existing = preparing.get(db.name);
  if (existing)
    return existing.planId === plan.id
      ? existing.task
      : existing.task.then(() => prepareWorkout(db, plan, unit));
  const task = (async () => {
    await requireCondition(
      db,
      plan.id,
      plannedMuscles(plan, await db.exercises.toArray()),
    );
    const id = await startWorkout(db, plan, unit),
      session = await db.sessions.get(id);
    if (!session) throw Error("セッションがありません");
    const rows = await db.sets
      .where("sessionId")
      .equals(id)
      .filter((r) => !r.deletedAt)
      .toArray();
    if (session.requiresTargetReview === false) return id;
    if (
      rows.some(
        (r) =>
          r.completedAt ||
          r.inputState?.repsTouched ||
          r.inputState?.weightTouched ||
          r.rirRaw,
      )
    ) {
      await save(
        db,
        "sessions",
        revised({ ...session, requiresTargetReview: false }),
      );
      return id;
    }
    if (!session.requiresTargetReview)
      await save(
        db,
        "sessions",
        revised({ ...session, requiresTargetReview: true }),
      );
    await generateRecommendations(db, id);
    await db.transaction(
      "rw",
      [
        db.sessions,
        db.sets,
        db.recommendations,
        db.wellness,
        db.health,
        db.exercises,
        db.queue,
      ],
      async () => {
        const current = await db.sessions.get(id);
        if (!current || current.status !== "active" || current.deletedAt)
          throw Error("メニューを選び直してください");
        await requireCondition(db, plan.id, [
          ...new Set(current.exercises.map((e) => e.muscle)),
        ]);
        const recs = (await db.recommendations.toArray()).filter(
            (r) => !r.deletedAt && r.sessionId === id && r.status === "draft",
          ),
          latest = new Map<string, Entities["recommendations"]>();
        for (const r of recs.sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        ))
          latest.set(r.exerciseId, r);
        if (latest.size !== current.exercises.length)
          throw Error(
            "目標を準備できませんでした。メニューを選び直してください",
          );
        for (const r of latest.values())
          await decideRecommendation(db, r.id, true);
        await save(
          db,
          "sessions",
          revised({ ...current, requiresTargetReview: false }),
        );
      },
    );
    return id;
  })().finally(() => {
    if (preparing.get(db.name)?.task === task) preparing.delete(db.name);
  });
  preparing.set(db.name, { planId: plan.id, task });
  return task;
}
