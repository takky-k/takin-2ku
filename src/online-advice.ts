import { type AppDB, demoDb, meta, save } from "./db";
import { localDate, type Entities } from "./model";
import { comparison, sessionDay } from "./training";
import { effectiveSleepHours } from "./health";
import { fatigueForMuscle, sorenessForMuscle } from "./wellness";
import { aiRequestSchema, validateAiReply } from "./ai-contract";
import {
  fetchAdvice,
  hasAiConsent,
  aiToken,
  useAI,
  consentKey,
  initAIAuth,
  installationReady,
} from "./ai-auth";
import {
  decideRecommendation,
  generateRecommendations,
} from "./recommendations";
const flights = new Map<string, Promise<boolean>>();
export async function buildAIInput(db: AppDB, id: string) {
  const d = await db.transaction(
    "r",
    [db.sessions, db.sets, db.wellness, db.health, db.exercises, db.profiles],
    async () => ({
      sessions: await db.sessions.toArray(),
      sets: await db.sets.toArray(),
      wellness: await db.wellness.toArray(),
      health: await db.health.toArray(),
      exercises: await db.exercises.toArray(),
      profile: await db.profiles.get("main"),
      candidates: await generateRecommendations(db, id, false),
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
    sleepHours: effectiveSleepHours(d.health, logs, day),
    sleepRange: logs.find((w) => w.sessionId === null)?.sleepRange ?? null,
    mood: logs.find((w) => w.mood !== null)?.mood ?? null,
    pain: logs.some((w) => w.painFlag),
    soreness: Object.assign(
      {},
      ...logs
        .filter((w) => w.sessionId === null)
        .reverse()
        .map((w) => w.sorenessByMuscle),
    ),
    fatigue: Object.fromEntries(
      session.exercises.flatMap((e) => {
        const values = logs
          .flatMap((w) => [
            fatigueForMuscle(w, e.muscle),
            sorenessForMuscle(w, e.muscle),
          ])
          .filter((n): n is number => n !== null);
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
  const limits = new Map(
    d.candidates.flatMap((rec) =>
      (rec.proposedTargets ?? []).map((t) => [t.setId, t] as const),
    ),
  );
  const past = d.sessions
    .filter(
      (s) => !s.deletedAt && s.status === "finished" && sessionDay(s) <= day,
    )
    .sort(
      (a, b) =>
        sessionDay(b).localeCompare(sessionDay(a)) ||
        b.startedAt.localeCompare(a.startedAt),
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
        new Date(session.startedAt),
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
        elapsedDays: history.elapsedDays,
        setNotes: past.flatMap((s) =>
          d.sets
            .filter(
              (r) =>
                !r.deletedAt &&
                r.completedAt &&
                r.sessionId === s.id &&
                r.exerciseId === e.exerciseId &&
                r.equipmentId === e.equipmentId &&
                r.notes.trim(),
            )
            .map((r) => ({
              daysAgo: (Date.parse(day) - Date.parse(sessionDay(s))) / 86400000,
              ordinal: r.ordinal,
              note: r.notes,
            })),
        ),
        history: past
          .flatMap((s) => {
            const sets = d.sets.filter(
              (r) =>
                !r.deletedAt &&
                r.completedAt &&
                r.sessionId === s.id &&
                r.exerciseId === e.exerciseId &&
                r.equipmentId === e.equipmentId,
            );
            return sets.length
              ? [
                  {
                    daysAgo:
                      (Date.parse(day) - Date.parse(sessionDay(s))) / 86400000,
                    sets: sets.length,
                    totalReps: sets.reduce((n, r) => n + r.reps, 0),
                    topWeightKg: Math.max(...sets.map((r) => r.weightKg)),
                  },
                ]
              : [];
          })
          .slice(0, 5),
        targets: current.map((r) => ({
          setId: r.id,
          ordinal: r.ordinal,
          weightKg: limits.get(r.id)?.weightKg ?? r.weightKg,
          reps: limits.get(r.id)?.reps ?? r.reps,
          targetRir: r.targetRir ?? null,
        })),
        previous: history.previousSets.slice(0, 20).map((r) => ({
          ordinal: r.ordinal,
          weightKg: r.weightKg,
          reps: r.reps,
          rir: r.rirSource === "default" ? null : r.rir,
        })),
      },
    ];
  });
  if (!exercises.length) return null;
  const input = aiRequestSchema.parse({
    version: 1,
    sessionId: id,
    profile:
      d.profile && !d.profile.deletedAt
        ? {
            age: d.profile.age ?? null,
            bodyWeightKg:
              d.wellness
                .filter(
                  (w) =>
                    !w.deletedAt &&
                    w.dateLocal <= day &&
                    w.bodyWeightKg !== null,
                )
                .sort(
                  (a, b) =>
                    b.dateLocal.localeCompare(a.dateLocal) ||
                    b.updatedAt.localeCompare(a.updatedAt),
                )[0]?.bodyWeightKg ?? null,
            targetWeightKg: d.profile.targetWeightKg,
            goal: d.profile.goal.slice(0, 80),
            targetDaysPerWeek: d.profile.targetDaysPerWeek,
            priorityMuscles: d.profile.priorityMuscles
              .slice(0, 20)
              .map((m) => m.slice(0, 40)),
          }
        : undefined,
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
    profileRevision: d.profile?.revision,
    wellness: d.wellness.map((w) => [w.id, w.revision]),
    health: d.health.map((h) => [h.id, h.revision]),
    exerciseRevisions: d.exercises.map((e) => [e.id, e.revision]),
    historyRevisions: d.sets
      .filter((r) => !r.deletedAt && r.completedAt && r.sessionId !== id)
      .map((r) => [r.id, r.revision]),
  };
}
export async function applyOnlineAdvice(db: AppDB, id: string) {
  if (db === demoDb || !hasAiConsent() || !navigator.onLine) return false;
  if (!useAI.getState().user && !useAI.getState().ready) await initAIAuth();
  if (!useAI.getState().user || !hasAiConsent()) return false;
  const uid = useAI.getState().user!.uid,
    consentStamp = localStorage.getItem(consentKey);
  if (!installationReady(uid)) return false;
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
      if (
        !hasAiConsent() ||
        localStorage.getItem(consentKey) !== consentStamp ||
        useAI.getState().user?.uid !== uid
      )
        return false;
      const body = JSON.stringify(snapshot.input);
      if (new TextEncoder().encode(body).length > 32768) throw Error();
      const raw = await fetchAdvice(body, token);
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
          db.profiles,
          db.recommendations,
          db.queue,
        ],
        async () => {
          if (
            !hasAiConsent() ||
            useAI.getState().user?.uid !== uid ||
            localStorage.getItem(consentKey) !== consentStamp ||
            (await db.profiles.get("main"))?.revision !==
              snapshot.profileRevision
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
          const historyRevisions = (await db.sets.toArray())
            .filter((r) => !r.deletedAt && r.completedAt && r.sessionId !== id)
            .map((r) => [r.id, r.revision]);
          if (
            JSON.stringify(historyRevisions) !==
            JSON.stringify(snapshot.historyRevisions)
          )
            throw Error();
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
