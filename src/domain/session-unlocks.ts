import { z } from 'zod';
import { technologySchema, validateTechnology } from './technology.js';
import { technologyAtTier, vanillaCatalog } from './vanilla.js';

/** Completed deliveries: phases 1–4 open tiers 3/5/7/9; phase 5 ends Project Assembly. */
export const MAX_HUB_TIER_BY_PHASE = [2, 4, 6, 8, 9, 9] as const;
export const unlockProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    catalogVersion: z.literal(vanillaCatalog.catalogVersion),
    hubTier: z.number().int().min(0).max(9).nullable(),
    spaceElevatorPhase: z.number().int().min(0).max(5),
    technology: technologySchema,
  })
  .strict();
export type UnlockProfile = z.infer<typeof unlockProfileSchema>;

export function validateUnlockProfile(value: unknown): UnlockProfile {
  const profile = unlockProfileSchema.parse(value);
  validateTechnology(profile.technology, vanillaCatalog);
  if (profile.hubTier !== null) {
    if (profile.hubTier > MAX_HUB_TIER_BY_PHASE[profile.spaceElevatorPhase]!)
      throw new Error('HUB-Tier benötigt eine höhere Space-Elevator-Phase.');
    const preset = technologyAtTier(profile.hubTier);
    if (JSON.stringify(preset) !== JSON.stringify(profile.technology))
      throw new Error(
        'Individuelle Unlocks benötigen ein individuelles Profil.',
      );
  }
  return profile;
}

export function createUnlockProfile(
  hubTier = 2,
  spaceElevatorPhase = MAX_HUB_TIER_BY_PHASE.findIndex((max) => hubTier <= max),
): UnlockProfile {
  return validateUnlockProfile({
    schemaVersion: 1,
    catalogVersion: vanillaCatalog.catalogVersion,
    hubTier,
    spaceElevatorPhase,
    technology: technologyAtTier(hubTier),
  });
}
