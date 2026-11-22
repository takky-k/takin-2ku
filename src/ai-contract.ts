import { z } from "zod";
const rir = z
  .object({
    min: z.number().min(0).max(10).multipleOf(0.5),
    max: z.number().min(0).max(10).multipleOf(0.5),
  })
  .refine((r) => r.min <= r.max)
  .nullable();
export const targetSchema = z
  .object({
    setId: z.string().min(1).max(100),
    weightKg: z.number().min(0).max(2000),
    reps: z.number().int().min(0).max(1000),
    targetRir: rir,
  })
  .strict();
export const aiRequestSchema = z
  .object({
    version: z.literal(1),
    sessionId: z.string().min(1).max(100),
    profile: z
      .object({
        age: z.number().int().min(1).max(120).nullable(),
        heightCm: z.number().min(50).max(250).nullable().optional(),
        bodyWeightKg: z.number().positive().nullable(),
        targetWeightKg: z.number().positive().nullable(),
        goal: z.string().max(80),
        targetDaysPerWeek: z.number().min(1).max(7),
        priorityMuscles: z.array(z.string().max(40)).max(20),
      })
      .strict()
      .optional(),
    condition: z
      .object({
        sleepHours: z.number().min(0).max(24).nullable(),
        sleepRange: z.enum(["atMost5", "atLeast8"]).nullable().optional(),
        mood: z.number().int().min(1).max(5).nullable(),
        pain: z.boolean(),
        fatigue: z.record(z.string().max(40), z.number().min(0).max(5)),
        soreness: z
          .record(z.string().max(40), z.number().min(0).max(5))
          .optional(),
      })
      .strict(),
    exercises: z
      .array(
        z
          .object({
            exerciseId: z.string().min(1).max(100),
            name: z.string().max(80),
            muscle: z.string().max(40),
            elapsedDays: z.number().min(0).nullable(),
            locked: z.boolean(),
            setNotes: z
              .array(
                z
                  .object({
                    daysAgo: z.number().int().nonnegative(),
                    ordinal: z.number().int().nonnegative(),
                    note: z.string().min(1),
                  })
                  .strict(),
              )
              .optional(),
            history: z
              .array(
                z
                  .object({
                    daysAgo: z.number().int().nonnegative(),
                    sets: z.number().int().positive(),
                    totalReps: z.number().int().nonnegative(),
                    topWeightKg: z.number().nonnegative(),
                  })
                  .strict(),
              )
              .max(5)
              .optional(),
            targets: z
              .array(
                targetSchema.extend({
                  ordinal: z.number().int().nonnegative().optional(),
                }),
              )
              .min(1)
              .max(20),
            previous: z
              .array(
                z.object({
                  ordinal: z.number().int().min(0),
                  weightKg: z.number().min(0).max(2000),
                  reps: z.number().int().min(0).max(1000),
                  rir,
                }),
              )
              .max(20),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export const aiReplySchema = z
  .object({
    recommendations: z
      .array(
        z
          .object({
            exerciseId: z.string().min(1).max(100),
            rationale: z.string().min(1).max(1200),
            targets: z.array(targetSchema).min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export type AiRequest = z.infer<typeof aiRequestSchema>;
export type AiReply = z.infer<typeof aiReplySchema>;
export function validateAiReply(request: AiRequest, raw: unknown): AiReply {
  const reply = aiReplySchema.parse(raw);
  if (reply.recommendations.length !== request.exercises.length)
    throw Error("種目数が一致しません");
  const seen = new Set<string>();
  for (const rec of reply.recommendations) {
    const e = request.exercises.find((e) => e.exerciseId === rec.exerciseId);
    if (!e || seen.has(e.exerciseId) || rec.targets.length !== e.targets.length)
      throw Error("種目またはセット数が一致しません");
    seen.add(e.exerciseId);
    const ids = new Set<string>();
    for (const t of rec.targets) {
      const base = e.targets.find((b) => b.setId === t.setId);
      if (!base || ids.has(t.setId)) throw Error("セットが一致しません");
      ids.add(t.setId);
      const previous = e.previous.find((p) => p.ordinal === base.ordinal);
      const repeatsPrevious =
        previous &&
        previous.weightKg === t.weightKg &&
        previous.reps === t.reps &&
        t.weightKg < base.weightKg;
      // AI can choose a modest reduction, never exceed the local safe plan.
      if (
        t.weightKg > base.weightKg + 0.000001 ||
        t.weightKg < base.weightKg * 0.9 - 0.000001 ||
        (t.reps > base.reps && !repeatsPrevious) ||
        t.reps < Math.max(0, base.reps - 2) ||
        t.targetRir?.min !== base.targetRir?.min ||
        t.targetRir?.max !== base.targetRir?.max
      )
        throw Error("安全上限を超える提案です");
      if (e.locked && (t.weightKg !== base.weightKg || t.reps !== base.reps))
        throw Error("固定セットは変更できません");
    }
  }
  return reply;
}
