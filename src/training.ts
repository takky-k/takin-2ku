import { validatedSet } from "./set-values";
import { type AppDB, meta, save, revised } from "./db";
import {
  type Entities,
  type PlannedSet,
  kgToDisplay,
  localDate,
} from "./model";

import { restorePendingSetInputs } from "./set-inputs";
import { remove } from "./db";
export async function skipExerciseToday(
  db: AppDB,
  sessionId: string,
  exerciseId: string,
) {
  await db.transaction("rw", [db.sessions, db.sets, db.queue], async () => {
    const session = await db.sessions.get(sessionId);
    if (!session || session.deletedAt) throw Error("記録がありません");
    for (const row of await db.sets
      .where("sessionId")
      .equals(sessionId)
      .filter((r) => r.exerciseId === exerciseId && !r.deletedAt)
      .toArray())
      await remove(db, "sets", row);
    await save(
      db,
      "sessions",
      revised({
        ...session,
        exercises: session.exercises.filter((e) => e.exerciseId !== exerciseId),
      }),
    );
  });
}
export function targets(
  t: Entities["plans"]["exercises"][number],
  unit: "kg" | "lb" = "kg",
): PlannedSet[] {
  return (
    t.plannedSets ??
    Array.from({ length: t.targetSets }, () => ({
      id: crypto.randomUUID(),
      weightKg: t.plannedWeightKg,
      inputUnit: unit,
      inputWeight: kgToDisplay(t.plannedWeightKg, unit),
      reps: t.repMin,
      targetRir: t.targetRir,
      setType: "normal",
      isLocked: false,
    }))
  );
}
export async function startWorkout(
  db: AppDB,
  plan: Entities["plans"],
  unit: "kg" | "lb",
) {
  return db.transaction(
    "rw",
    [db.sessions, db.sets, db.exercises, db.queue],
    async () => {
      const active = await db.sessions
        .where("status")
        .equals("active")
        .filter((s) => !s.deletedAt)
        .first();
      if (active?.planId === plan.id) return active.id;
      if (active)
        await save(db, "sessions", revised({ ...active, status: "paused" }));
      const paused = await db.sessions
        .where("status")
        .equals("paused")
        .filter((s) => !s.deletedAt && s.planId === plan.id)
        .first();
      if (paused) {
        await save(db, "sessions", revised({ ...paused, status: "active" }));
        return paused.id;
      }
      const exercises = await db.exercises.toArray();
      const session: Entities["sessions"] = {
        ...meta(),
        name: plan.name,
        planId: plan.id,
        startedAt: new Date().toISOString(),
        endedAt: null,
        status: "active",
        notes: "",
        generalNotes: plan.generalNotes,
        slotLabel: plan.catalogKey ?? plan.dayLabel,
        performedDateLocal: localDate(),
        timePrecision: "timestamp",
        exercises: plan.exercises.map((t) => {
          const e = exercises.find(
            (e) => e.id === t.exerciseId && !e.deletedAt,
          );
          if (!e)
            throw Error("種目が見つかりません。メニューを編集してください。");
          return {
            exerciseId: e.id,
            name: e.name,
            muscle: e.muscle,
            equipmentId: e.equipmentId,
            notes: "",
            evergreenNotes: e.evergreenNotes ?? e.notes,
            measurementBasis: e.measurementBasis,
          };
        }),
      };
      await save(db, "sessions", session);
      for (const t of plan.exercises) {
        const exercise = exercises.find((e) => e.id === t.exerciseId)!;
        for (const [ordinal, target] of targets(t, unit).entries())
          await save(db, "sets", {
            ...meta(),
            sessionId: session.id,
            exerciseId: t.exerciseId,
            equipmentId: exercise.equipmentId,
            ordinal,
            setType: "normal",
            weightKg: target.weightKg,
            inputWeight: target.inputWeight,
            inputUnit: target.inputUnit,
            loadMode: exercise.measurementBasis,
            reps: target.reps,
            inputState: {
              weight: String(target.inputWeight),
              reps: "",
              rir: "",
              weightTouched: false,
              repsTouched: false,
            },
            rir: null,
            rirRaw: "",
            rirConfidence: "unknown",
            targetRir: target.targetRir,
            rpe: null,
            completedAt: null,
            notes: "",
            restSeconds: exercise.defaultRestSeconds ?? 120,
            isLocked: target.isLocked,
          });
      }
      return session.id;
    },
  );
}
export const sessionDay = (s: Entities["sessions"]) =>
  s.performedDateLocal ?? localDate(new Date(s.startedAt));
export function comparison(
  sessions: Entities["sessions"][],
  sets: Entities["sets"][],
  exerciseId: string,
  equipmentId: string,
  at = new Date(),
  exclude?: string,
) {
  const eligible = sessions
    .filter(
      (s) =>
        s.id !== exclude &&
        !s.deletedAt &&
        s.status === "finished" &&
        sessionDay(s) <= localDate(at) &&
        sets.some(
          (r) =>
            r.sessionId === s.id &&
            r.exerciseId === exerciseId &&
            r.equipmentId === equipmentId &&
            r.completedAt &&
            !r.deletedAt,
        ),
    )
    .sort(
      (a, b) =>
        sessionDay(b).localeCompare(sessionDay(a)) ||
        b.startedAt.localeCompare(a.startedAt),
    );
  const previous = eligible[0];
  const weekAgo = new Date(at);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const sameSlot = eligible.find((s) => sessionDay(s) === localDate(weekAgo));
  return {
    previous,
    sameSlot,
    previousSets: previous
      ? sets
          .filter(
            (r) =>
              r.sessionId === previous.id &&
              r.exerciseId === exerciseId &&
              r.equipmentId === equipmentId &&
              r.completedAt &&
              !r.deletedAt,
          )
          .sort((a, b) => a.ordinal - b.ordinal)
      : [],
  };
}
export async function finishWorkout(db: AppDB, id: string) {
  const rows = await db.sets
      .where("sessionId")
      .equals(id)
      .filter((r) => !r.deletedAt)
      .toArray(),
    unit = (await db.profiles.get("main"))?.units ?? "kg";
  for (const row of rows) {
    let raw: string | null = null;
    try {
      raw =
        localStorage.getItem(`takin-sheet-draft-${db.name}-${row.id}`) ??
        localStorage.getItem(`takin-table-draft-${db.name}-${row.id}-${unit}`);
    } catch {
      /* IndexedDB remains primary. */
    }
    if (raw)
      try {
        const cached = JSON.parse(raw);
        validatedSet(row, cached.fields ?? cached, cached.unit ?? unit);
      } catch {
        throw Error(
          `セット${row.ordinal + 1}に入力途中または不正な値があります。重量・回数・RIRを確認してください。`,
        );
      }
  }
  await restorePendingSetInputs(db, new Set(rows.map((r) => r.id)));
  await db.transaction("rw", [db.sessions, db.sets, db.queue], async () => {
    const session = await db.sessions.get(id);
    if (!session || session.deletedAt) throw Error("セッションがありません");
    if (session.status === "finished") return;
    const current = await db.sets
      .where("sessionId")
      .equals(id)
      .filter(
        (r) =>
          !r.deletedAt &&
          session.exercises.some((e) => e.exerciseId === r.exerciseId),
      )
      .toArray();
    if (!current.length) throw Error("保存するセットがありません");
    const stamp = new Date().toISOString();
    for (const row of current) {
      try {
        const valid = validatedSet(row);
        if (row.completedAt) continue;
        await save(
          db,
          "sets",
          revised({ ...valid, completedAt: row.completedAt ?? stamp }),
        );
      } catch {
        throw Error(
          `セット${row.ordinal + 1}に入力途中または不正な値があります。入力を確認してください`,
        );
      }
    }
    await save(
      db,
      "sessions",
      revised({ ...session, status: "finished", endedAt: stamp }),
    );
  });
}
