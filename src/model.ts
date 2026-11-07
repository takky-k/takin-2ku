import { z } from "zod";
export const metaSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(2),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  clientId: z.string().min(1),
  revision: z.number().int().positive(),
});
export const rirSchema = z
  .object({
    min: z.number().min(0).max(10).multipleOf(0.5),
    max: z.number().min(0).max(10).multipleOf(0.5),
  })
  .refine((v) => v.min <= v.max, "RIRの範囲が逆です")
  .nullable();
export type Rir = z.infer<typeof rirSchema>;
export function parseRir(value: string): Rir {
  if (!value.trim()) return null;
  if (!/^\d+(?:\.\d+)?(?:\s*[~〜～–-]\s*\d+(?:\.\d+)?)?$/.test(value.trim()))
    throw Error("RIRは0〜10、0.5刻みで入力してください");
  const parts = value
    .trim()
    .split(/[~〜～–-]/)
    .map(Number);
  if (parts.length > 2 || parts.some(Number.isNaN))
    throw Error("RIRは0〜10、0.5刻みで入力してください");
  return rirSchema.parse({ min: parts[0], max: parts[1] ?? parts[0] });
}
export const formatRir = (r: Rir) =>
  r === null
    ? "未入力"
    : r.min === r.max
      ? String(r.min)
      : `${r.min}〜${r.max}`;
export const exerciseSchema = metaSchema.extend({
  name: z.string().min(1),
  muscle: z.string().min(1),
  equipmentId: z.string(),
  notes: z.string(),
  measurementBasis: z.enum(["total", "eachSide", "plateStack", "bodyweight"]),
});
export const targetSchema = z.object({
  exerciseId: z.string(),
  targetSets: z.number().int().min(1).max(20),
  repMin: z.number().int().min(0),
  repMax: z.number().int().min(0),
  targetRir: rirSchema,
  plannedWeightKg: z.number().min(0),
});
export const planSchema = metaSchema.extend({
  name: z.string().min(1),
  dayLabel: z.string(),
  exercises: z.array(targetSchema),
});
export const snapshotSchema = z.object({
  exerciseId: z.string(),
  name: z.string(),
  muscle: z.string(),
  equipmentId: z.string(),
  notes: z.string(),
});
export const sessionSchema = metaSchema.extend({
  name: z.string(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  status: z.enum(["active", "finished"]),
  planId: z.string().nullable(),
  exercises: z.array(snapshotSchema),
  notes: z.string(),
});
export const setSchema = metaSchema.extend({
  sessionId: z.string(),
  exerciseId: z.string(),
  equipmentId: z.string(),
  ordinal: z.number().int().min(0),
  setType: z.enum(["warmup", "normal", "drop", "failure"]),
  weightKg: z.number().min(0).max(2000),
  reps: z.number().int().min(0).max(1000),
  rir: rirSchema,
  rpe: z.number().min(1).max(10).nullable(),
  completedAt: z.iso.datetime().nullable(),
  notes: z.string(),
  restSeconds: z.number().min(0).nullable(),
});
export const wellnessSchema = metaSchema.extend({
  sessionId: z.string().nullable(),
  dateLocal: z.string(),
  sleepHours: z.number().min(0).max(24).nullable(),
  mood: z.number().min(1).max(5).nullable(),
  fatigue: z.number().min(1).max(5).nullable(),
  painFlag: z.boolean(),
  sorenessByMuscle: z.record(z.string(), z.number().min(0).max(5)),
  bodyWeightKg: z.number().positive().nullable(),
  notes: z.string(),
});
export const recommendationSchema = metaSchema.extend({
  exerciseId: z.string(),
  planId: z.string(),
  sourceModel: z.string(),
  modelVersion: z.string(),
  originalWeightKg: z.number(),
  proposedWeightKg: z.number(),
  rationale: z.string(),
  evidenceIds: z.array(z.string()),
  predictedPerformance: z.number().nullable(),
  actualPerformance: z.number().nullable(),
  confidence: z.number().nullable(),
  status: z.enum(["draft", "accepted", "rejected", "edited"]),
  decisionAt: z.iso.datetime().nullable(),
});
export const healthSchema = metaSchema.extend({
  type: z.string(),
  value: z.number(),
  unit: z.string(),
  startAt: z.iso.datetime(),
  source: z.string(),
  sourceRecordHash: z.string(),
  importedAt: z.iso.datetime(),
});
export const profileSchema = metaSchema.extend({
  units: z.enum(["kg", "lb"]),
  goal: z.string(),
  targetDaysPerWeek: z.number().min(1).max(7),
  targetWeightKg: z.number().positive().nullable(),
  theme: z.enum(["dark", "light"]),
  priorityMuscles: z.array(z.string()),
});
export const schemas = {
  exercises: exerciseSchema,
  plans: planSchema,
  sessions: sessionSchema,
  sets: setSchema,
  wellness: wellnessSchema,
  recommendations: recommendationSchema,
  health: healthSchema,
  profiles: profileSchema,
};
export type EntityName = keyof typeof schemas;
export type Entities = { [K in EntityName]: z.infer<(typeof schemas)[K]> };
export type Meta = z.infer<typeof metaSchema>;
export type WorkoutSet = Entities["sets"];
export const kgToDisplay = (kg: number, unit: "kg" | "lb") =>
  unit === "kg" ? kg : kg * 2.2046226218;
export const displayToKg = (weight: number, unit: "kg" | "lb") =>
  unit === "kg" ? weight : weight / 2.2046226218;
export const round = (v: number) => Math.round(v * 100) / 100;
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
