import { type WorkoutSet, displayToKg, parseRir, setSchema } from "./model";
export function resolvedReps(row: WorkoutSet, fields = row.inputState) {
  if (!fields)
    return { reps: row.reps, source: row.repsSource ?? ("entered" as const) };
  if (!fields.reps.trim() && !fields.repsTouched && row.reps > 0)
    return { reps: row.reps, source: "default" as const };
  if (!/^\d+$/.test(fields.reps) || Number(fields.reps) > 1000)
    throw Error("回数を入力してください");
  return { reps: Number(fields.reps), source: "entered" as const };
}
export function validatedSet(
  row: WorkoutSet,
  fields = row.inputState,
  unit = row.inputUnit ?? "kg",
) {
  const resolved = resolvedReps(row, fields);
  if (!fields) return setSchema.parse({ ...row, repsSource: resolved.source });
  if (
    !fields.weight.trim() ||
    !Number.isFinite(Number(fields.weight)) ||
    Number(fields.weight) < 0 ||
    displayToKg(Number(fields.weight), unit) > 2000
  )
    throw Error("重量を確認してください");
  return setSchema.parse({
    ...row,
    weightKg: fields.weightTouched
      ? displayToKg(Number(fields.weight), unit)
      : row.weightKg,
    reps: resolved.reps,
    repsSource: resolved.source,
    rir: parseRir(fields.rir),
    rirRaw: fields.rir,
  });
}
