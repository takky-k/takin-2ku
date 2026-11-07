import { z } from "zod";
export const metaSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(3),
  source: z.string().optional(),
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
  evergreenNotes: z.string().optional(),
  historicalNotes: z.string().optional(),
  category: z.enum(["compound", "isolation", "other"]).optional(),
  defaultRestSeconds: z.number().nonnegative().optional(),
  autoProgression: z.boolean().optional(),
  formVideoUrls: z.array(z.url()).optional(),
  measurementBasis: z.enum([
    "total",
    "eachSide",
    "plateStack",
    "bodyweight",
    "assisted",
    "dumbbellEach",
    "barbellTotal",
    "unknown",
  ]),
});
export const plannedSetSchema = z.object({
  id: z.string(),
  weightKg: z.number().min(0).max(2000),
  inputUnit: z.enum(["kg", "lb"]),
  inputWeight: z.number().min(0),
  reps: z.number().int().min(0).max(1000),
  targetRir: rirSchema,
  setType: z.enum(["warmup", "normal", "drop", "failure"]),
  isLocked: z.boolean(),
});
export type PlannedSet = z.infer<typeof plannedSetSchema>;
export const targetSchema = z.object({
  exerciseId: z.string(),
  targetSets: z.number().int().min(1).max(20),
  repMin: z.number().int().min(0),
  repMax: z.number().int().min(0),
  targetRir: rirSchema,
  plannedWeightKg: z.number().min(0),
  plannedSets: z.array(plannedSetSchema).min(1).max(20).optional(),
});
export const planSchema = metaSchema.extend({
  name: z.string().min(1),
  dayLabel: z.string(),
  generalNotes: z.string().optional(),
  catalogKey: z.string().optional(),
  exercises: z.array(targetSchema),
});
export const snapshotSchema = z.object({
  exerciseId: z.string(),
  name: z.string(),
  muscle: z.string(),
  equipmentId: z.string(),
  notes: z.string(),
  evergreenNotes: z.string().optional(),
  measurementBasis: z.string().optional(),
});
export const sessionSchema = metaSchema.extend({
  name: z.string(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  status: z.enum(["active", "finished"]),
  requiresTargetReview: z.boolean().optional(),
  planId: z.string().nullable(),
  exercises: z.array(snapshotSchema),
  notes: z.string(),
  performedDateLocal: z.string().optional(),
  timePrecision: z.enum(["timestamp", "date"]).optional(),
  slotLabel: z.string().optional(),
  generalNotes: z.string().optional(),
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
  inputUnit: z.enum(["kg", "lb"]).optional(),
  inputWeight: z.number().nonnegative().optional(),
  loadMode: z.string().optional(),
  targetRir: rirSchema.optional(),
  rirRaw: z.string().optional(),
  rirConfidence: z.enum(["exact", "range", "unknown", "unverified"]).optional(),
  sourceRowId: z.string().optional(),
  isLocked: z.boolean().optional(),
  inputState: z
    .object({
      weight: z.string(),
      reps: z.string(),
      rir: z.string(),
      weightTouched: z.boolean(),
      repsTouched: z.boolean(),
    })
    .optional(),
  referencePrevious: z
    .object({
      weightKg: z.number().nonnegative(),
      reps: z.number().int().nonnegative(),
      rir: rirSchema,
    })
    .optional(),
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
  explicitInputFlags: z.record(z.string(), z.boolean()).optional(),
  sleepStatus: z
    .enum(["not-acquired", "available", "failed", "no-measurement"])
    .optional(),
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
  sessionId: z.string().optional(),
  proposedTargets: z
    .array(
      z.object({
        setId: z.string(),
        weightKg: z.number(),
        reps: z.number().int(),
        targetRir: rirSchema,
      }),
    )
    .optional(),
  sessionRevision: z.number().optional(),
  setRevisions: z.record(z.string(), z.number()).optional(),
});
export const healthSchema = metaSchema.extend({
  type: z.string(),
  value: z.number(),
  unit: z.string(),
  startAt: z.iso.datetime(),
  source: z.string(),
  sourceRecordHash: z.string(),
  importedAt: z.iso.datetime(),
  endAt: z.iso.datetime().optional(),
  dateLocal: z.string().optional(),
  stage: z.enum(["asleep", "core", "deep", "rem", "awake", "inBed"]).optional(),
  externalId: z.string().optional(),
});
export const profileSchema = metaSchema.extend({
  units: z.enum(["kg", "lb"]),
  goal: z.string(),
  targetDaysPerWeek: z.number().min(1).max(7),
  targetWeightKg: z.number().positive().nullable(),
  theme: z.enum(["dark", "light"]),
  priorityMuscles: z.array(z.string()),
});
export const importRowSchema = metaSchema.extend({
  sourceHash: z.string(),
  batchId: z.string(),
  rowNumber: z.number().int(),
  raw: z.record(z.string(), z.string()),
  issues: z.array(z.string()),
  status: z.enum(["imported", "review", "excluded"]),
  setId: z.string().nullable(),
  dateLocal: z.string(),
});
export const importBatchSchema = metaSchema.extend({
  fileName: z.string(),
  fileHash: z.string(),
  rowCount: z.number().int(),
  importedCount: z.number().int(),
  reviewCount: z.number().int(),
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
  importRows: importRowSchema,
  importBatches: importBatchSchema,
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
