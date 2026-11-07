import { type AppDB, meta, save, revised } from "./db";
import {
  type Entities,
  type PlannedSet,
  kgToDisplay,
  localDate,
} from "./model";
import { parseRir, displayToKg, setSchema } from "./model";
import { restorePendingSetInputs } from "./set-inputs";
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
      if (active) return active.id;
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
      raw = localStorage.getItem(
        `takin-table-draft-${db.name}-${row.id}-${unit}`,
      );
    } catch {
      /* IndexedDB can still be available without localStorage. */
    }
    if (raw) {
      try {
        const fields = JSON.parse(raw);
        if (
          typeof fields.weight !== "string" ||
          typeof fields.reps !== "string" ||
          typeof fields.rir !== "string" ||
          !fields.weight.trim() ||
          !fields.reps.trim()
        )
          throw Error("未入力");
        setSchema.parse({
          ...row,
          weightKg: displayToKg(Number(fields.weight), unit),
          reps: Number(fields.reps),
          rir: parseRir(fields.rir),
        });
      } catch {
        throw Error(
          `セット${row.ordinal + 1}に入力途中または不正な値があります。重量・回数・RIRを確認してください。`,
        );
      }
    }
  }
  await restorePendingSetInputs(db, new Set(rows.map((r) => r.id)));
  await db.transaction("rw", [db.sessions, db.sets, db.queue], async () => {
    const session = await db.sessions.get(id);
    if (!session || session.deletedAt) throw Error("セッションがありません");
    if (session.status === "finished") return;
    if (
      !(await db.sets
        .where("sessionId")
        .equals(id)
        .filter((r) => !r.deletedAt && !!r.completedAt)
        .count())
    )
      throw Error("完了したセットがありません");
    await save(
      db,
      "sessions",
      revised({
        ...session,
        status: "finished",
        endedAt: new Date().toISOString(),
      }),
    );
  });
}
