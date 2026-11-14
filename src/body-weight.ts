import type { Entities } from "./model";
import { kgToDisplay } from "./model";

// This personal app's legacy body-weight fields were filled with kg numbers
// even when the shared load selector said lb. Preserve the original for audit.
// The version marker makes upgrades and backup imports idempotent.
export function correctLegacyBodyWeights(
  profiles: Entities["profiles"][],
  wellness: Entities["wellness"][],
) {
  const wasLb = profiles.find((p) => p.id === "main")?.units === "lb";
  for (const log of wellness) {
    if (log.bodyWeightUnitVersion === 1) continue;
    if (
      wasLb &&
      log.bodyWeightKg !== null &&
      ["manual", "legacy-v2"].includes(log.source ?? "manual")
    ) {
      log.legacyBodyWeightKg = log.bodyWeightKg;
      log.bodyWeightKg = kgToDisplay(log.bodyWeightKg, "lb");
    }
    log.bodyWeightUnitVersion = 1;
  }
  for (const profile of profiles) {
    if (profile.bodyWeightUnitVersion === 1) continue;
    if (profile.units === "lb" && profile.targetWeightKg !== null) {
      profile.legacyTargetWeightKg = profile.targetWeightKg;
      profile.targetWeightKg = kgToDisplay(profile.targetWeightKg, "lb");
    }
    profile.bodyWeightUnitVersion = 1;
  }
}
