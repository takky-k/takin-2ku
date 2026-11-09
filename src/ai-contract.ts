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
    condition: z
      .object({
        sleepHours: z.number().min(0).max(24).nullable(),
        mood: z.number().int().min(1).max(5).nullable(),
        pain: z.boolean(),
        fatigue: z.record(z.string().max(40), z.number().min(0).max(5)),
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
            targets: z.array(targetSchema).min(1).max(20),
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
      // AI can choose a modest reduction, never exceed the local safe plan.
      if (
        t.weightKg > base.weightKg + 0.000001 ||
        t.weightKg < base.weightKg * 0.9 - 0.000001 ||
        t.reps > base.reps ||
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
