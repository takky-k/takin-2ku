import { type AppDB, demoDb, meta, save } from "./db";
import { localDate, type Entities } from "./model";
import { comparison, sessionDay } from "./training";
import { sleepHoursForDate } from "./health";
import { aiRequestSchema, validateAiReply } from "./ai-contract";
import { AI_ENDPOINT, hasAiConsent, aiToken, useAI } from "./ai-auth";
import { decideRecommendation } from "./recommendations";
const flights = new Map<string, Promise<boolean>>();
export async function buildAIInput(db: AppDB, id: string) {
  const d = await db.transaction(
    "r",
    [db.sessions, db.sets, db.wellness, db.health, db.exercises],
    async () => ({
      sessions: await db.sessions.toArray(),
      sets: await db.sets.toArray(),
      wellness: await db.wellness.toArray(),
      health: await db.health.toArray(),
      exercises: await db.exercises.toArray(),
    }),
  );
  const session = d.sessions.find(
    (s) => s.id === id && !s.deletedAt && s.status === "active",
  );
  if (!session) throw Error("記録中のセッションがありません");
  const day = localDate(),
    logs = d.wellness
      .filter((w) => !w.deletedAt && w.dateLocal === day)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const condition = {
    sleepHours:
      sleepHoursForDate(d.health, day) ??
      logs.find((w) => w.sleepHours !== null)?.sleepHours ??
      null,
    mood: logs.find((w) => w.mood !== null)?.mood ?? null,
    pain: logs.some((w) => w.painFlag),
    fatigue: Object.fromEntries(
      session.exercises.flatMap((e) => {
        const values = logs
          .map((w) => w.fatigueByMuscle?.[e.muscle])
          .filter((n): n is number => n !== undefined);
        return values.length ? [[e.muscle, Math.max(...values)]] : [];
      }),
    ),
  };
  const rows = d.sets.filter(
    (r) =>
      r.sessionId === id &&
      !r.deletedAt &&
      !r.completedAt &&
      !r.inputState?.weightTouched &&
      !r.inputState?.repsTouched &&
      !r.rirRaw,
  );
  const exercises = session.exercises.flatMap((e) => {
    const current = rows
      .filter((r) => r.exerciseId === e.exerciseId)
      .sort((a, b) => a.ordinal - b.ordinal);
    if (!current.length) return [];
    const history = comparison(
        d.sessions,
        d.sets,
        e.exerciseId,
        e.equipmentId,
        new Date(),
        id,
      ),
      locked =
        d.exercises.find((x) => x.id === e.exerciseId)?.autoProgression ===
          false || current.some((r) => r.isLocked);
    return [
      {
        exerciseId: e.exerciseId,
        name: e.name.slice(0, 80),
        muscle: e.muscle.slice(0, 40),
        locked,
        elapsedDays: history.previous
          ? Math.max(
              0,
              (Date.parse(day + "T12:00:00Z") -
                Date.parse(sessionDay(history.previous) + "T12:00:00Z")) /
                86400000,
            )
          : null,
        targets: current.map((r) => ({
          setId: r.id,
          weightKg: r.weightKg,
          reps: r.reps,
          targetRir: r.targetRir ?? null,
        })),
        previous: history.previousSets
          .slice(0, 20)
          .map((r) => ({
            ordinal: r.ordinal,
            weightKg: r.weightKg,
            reps: r.reps,
            rir: r.rir,
          })),
      },
    ];
  });
  if (!exercises.length) return null;
  const input = aiRequestSchema.parse({
    version: 1,
    sessionId: id,
    condition,
    exercises,
  });
  const evidence = d.sets
    .filter((r) => !r.deletedAt && r.completedAt && r.sessionId !== id)
    .map((r) => r.id);
  return {
    input,
    session,
    rows,
    evidence,
    wellness: d.wellness.map((w) => [w.id, w.revision]),
    health: d.health.map((h) => [h.id, h.revision]),
    exerciseRevisions: d.exercises.map((e) => [e.id, e.revision]),
  };
}
export async function applyOnlineAdvice(db: AppDB, id: string) {
  if (
    db === demoDb ||
    !hasAiConsent() ||
    !useAI.getState().user ||
    !navigator.onLine
  )
    return false;
  const uid = useAI.getState().user!.uid,
    consentStamp = localStorage.getItem("takin-ai-consent-v1");
  const key = db.name + id;
  if (flights.has(key)) return flights.get(key)!;
  const task = (async () => {
    useAI.setState({
      busy: true,
      error: false,
      message: "Cloudflare AIで目標を確認しています…",
    });
    try {
      const snapshot = await buildAIInput(db, id);
      if (!snapshot) return false;
      const token = await aiToken();
      if (!hasAiConsent()) return false;
      const body = JSON.stringify(snapshot.input);
      if (new TextEncoder().encode(body).length > 32768) throw Error();
      const response = await fetch(AI_ENDPOINT + "/advice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body,
        signal: AbortSignal.timeout(15000),
        credentials: "omit",
      });
      if (!response.ok) throw Error("request failed");
      const raw = await response.json();
      if (
        raw.model !== "@cf/google/gemma-4-26b-a4b-it" ||
        raw.modelVersion !== "1.0"
      )
        throw Error();
      const reply = validateAiReply(snapshot.input, {
        recommendations: raw.recommendations,
      });
      await db.transaction(
        "rw",
        [
          db.sessions,
          db.sets,
          db.wellness,
          db.health,
          db.exercises,
          db.recommendations,
          db.queue,
        ],
        async () => {
          if (
            !hasAiConsent() ||
            useAI.getState().user?.uid !== uid ||
            localStorage.getItem("takin-ai-consent-v1") !== consentStamp
          )
            throw Error();
          const current = await db.sessions.get(id);
          if (
            !current ||
            current.revision !== snapshot.session.revision ||
            current.status !== "active" ||
            current.deletedAt
          )
            throw Error();
          for (const r of snapshot.rows) {
            const actual = await db.sets.get(r.id);
            if (
              !actual ||
              actual.revision !== r.revision ||
              actual.completedAt ||
              actual.deletedAt
            )
              throw Error();
          }
          for (const [table, expected] of [
            [db.wellness, snapshot.wellness],
            [db.health, snapshot.health],
            [db.exercises, snapshot.exerciseRevisions],
          ] as const) {
            const list = await table.toArray();
            if (
              JSON.stringify(list.map((r) => [r.id, r.revision])) !==
              JSON.stringify(expected)
            )
              throw Error();
          }
          for (const rec of reply.recommendations) {
            const targets = rec.targets;
            const old = snapshot.rows.filter(
              (r) => r.exerciseId === rec.exerciseId,
            );
            const record: Entities["recommendations"] = {
              ...meta(),
              sessionId: id,
              sessionRevision: current.revision,
              exerciseId: rec.exerciseId,
              planId: current.planId ?? "",
              sourceModel: "cloudflare-workers-ai",
              modelVersion: "gemma-4-26b-a4b-it/1.0",
              originalWeightKg: old[0].weightKg,
              proposedWeightKg: targets[0].weightKg,
              proposedTargets: targets,
              setRevisions: Object.fromEntries(
                old.map((r) => [r.id, r.revision]),
              ),
              evidenceIds: snapshot.evidence,
              rationale: rec.rationale,
              predictedPerformance: null,
              actualPerformance: null,
              confidence: null,
              status: "draft",
              decisionAt: null,
            };
            await save(db, "recommendations", record);
            await decideRecommendation(db, record.id, true);
          }
        },
      );
      useAI.setState({
        message: "Cloudflare AIの提案を安全確認して反映しました",
        error: false,
      });
      return true;
    } catch {
      useAI.setState({
        message:
          "外部AIを利用できなかったため端末内の目標を使用します。ログイン・本人UIDの許可・無料枠を確認してください",
        error: true,
      });
      return false;
    } finally {
      useAI.setState({ busy: false });
    }
  })().finally(() => flights.delete(key));
  flights.set(key, task);
  return task;
}
