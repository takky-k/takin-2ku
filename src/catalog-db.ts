import { type AppDB, meta, save } from "./db";
import { catalog, planNotes } from "./defaults";
import { displayToKg, type Entities } from "./model";
export async function installDefaultPlans(db: AppDB) {
  await db.transaction("rw", [db.exercises, db.plans, db.queue], async () => {
    // Installing v2.1 is additive: never replace a user's existing menus or records.
    const plans = await db.plans.toArray();
    for (const key of ["A", "B"] as const) {
      if (plans.some((p) => p.catalogKey === key)) continue;
      const targets: Entities["plans"]["exercises"] = [];
      for (const entry of catalog.slice(
        key === "A" ? 0 : 5,
        key === "A" ? 5 : 10,
      )) {
        const existing = (await db.exercises.toArray()).find(
          (e) =>
            !e.deletedAt &&
            e.source === "default-v2.1" &&
            e.name === entry.name,
        );
        const e: Entities["exercises"] = existing ?? {
          ...meta(),
          source: "default-v2.1",
          name: entry.name,
          muscle: entry.muscle,
          equipmentId: entry.equipment,
          measurementBasis:
            entry.equipment === "ダンベル" ? "dumbbellEach" : "plateStack",
          notes: "",
          evergreenNotes: entry.notes,
          formVideoUrls: "videos" in entry ? [...entry.videos] : [],
          category: entry.category,
          defaultRestSeconds: entry.rest,
          autoProgression: !("locked" in entry && entry.locked),
        };
        if (!existing) await save(db, "exercises", e);
        const plannedSets = entry.weights.map((weight, i) => ({
          id: crypto.randomUUID(),
          weightKg: displayToKg(weight, "lb"),
          inputUnit: "lb" as const,
          inputWeight: weight,
          reps: entry.reps[i],
          targetRir: { min: 2, max: 2 },
          setType: "normal" as const,
          isLocked: "locked" in entry && entry.locked,
        }));
        targets.push({
          exerciseId: e.id,
          targetSets: plannedSets.length,
          repMin: Math.min(...entry.reps),
          repMax: Math.max(...entry.reps),
          targetRir: { min: 2, max: 2 },
          plannedWeightKg: plannedSets[0].weightKg,
          plannedSets,
        });
      }
      await save(db, "plans", {
        ...meta(),
        source: "default-v2.1",
        catalogKey: key,
        name: key === "A" ? "A｜背中・リアデルト・二頭筋" : "B｜胸・肩・三頭筋",
        dayLabel:
          key === "A" ? "例：月・木（自由に変更）" : "例：火・金（自由に変更）",
        generalNotes: planNotes[key],
        exercises: targets,
      });
    }
  });
}
export async function seed(db: AppDB, demo = false) {
  if (await db.profiles.count()) return;
  await db.transaction(
    "rw",
    [
      db.profiles,
      db.exercises,
      db.plans,
      db.sessions,
      db.sets,
      db.wellness,
      db.queue,
    ],
    async () => {
      if (await db.profiles.count()) return;
      await save(db, "profiles", {
        ...meta(),
        id: "main",
        units: "lb",
        goal: "筋肥大",
        targetDaysPerWeek: 4,
        targetWeightKg: null,
        bodyWeightUnitVersion: 1,
        theme: "dark",
        priorityMuscles: ["胸", "背中", "肩", "上腕"],
      });
      await installDefaultPlans(db);
      if (!demo) return;
      const plans = await db.plans.toArray(),
        exercises = await db.exercises.toArray();
      for (let n = 0; n < 6; n++) {
        const p = plans[n % plans.length],
          startedAt = new Date(
            Date.now() - (18 - n * 3) * 86400000,
          ).toISOString();
        const s: Entities["sessions"] = {
          ...meta(),
          source: "demo",
          name: p.name,
          startedAt,
          endedAt: startedAt,
          status: "finished",
          planId: p.id,
          notes: "架空のデモ記録",
          slotLabel: p.catalogKey,
          exercises: p.exercises.map((t) => {
            const e = exercises.find((e) => e.id === t.exerciseId)!;
            return {
              exerciseId: e.id,
              name: e.name,
              muscle: e.muscle,
              equipmentId: e.equipmentId,
              notes: "",
              evergreenNotes: e.evergreenNotes,
            };
          }),
        };
        await save(db, "sessions", s);
        for (const t of p.exercises)
          for (const [ordinal, target] of t.plannedSets!.entries()) {
            const e = exercises.find((e) => e.id === t.exerciseId)!;
            // Deliberately synthetic and confined to the demo database.
            await save(db, "sets", {
              ...meta(),
              source: "demo",
              sessionId: s.id,
              exerciseId: e.id,
              equipmentId: e.equipmentId,
              ordinal,
              setType: target.setType,
              weightKg: target.weightKg * (0.85 + n * 0.02),
              reps: target.reps,
              rir: { min: 1, max: 2 },
              rpe: null,
              completedAt: startedAt,
              notes: "デモ",
              restSeconds: e.defaultRestSeconds ?? 120,
              inputUnit: "lb",
              loadMode: e.measurementBasis,
            });
          }
        await save(db, "wellness", {
          ...meta(),
          source: "demo",
          sessionId: s.id,
          dateLocal: startedAt.slice(0, 10),
          sleepHours: null,
          sleepStatus: "not-acquired",
          mood: 4,
          fatigue: 2,
          painFlag: false,
          sorenessByMuscle: {},
          bodyWeightKg: 70 - n * 0.1,
          bodyWeightUnitVersion: 1,
          notes: "架空のデモ記録",
        });
      }
    },
  );
}
