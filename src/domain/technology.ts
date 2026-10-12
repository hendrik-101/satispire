import { z } from 'zod';
import type { Catalog, CatalogRecipe } from './catalog.js';
import { Rational } from './rational.js';

export const BELT_CAPACITIES = [
  '60',
  '120',
  '270',
  '480',
  '780',
  '1200',
] as const;
export const PIPE_CAPACITIES = ['300', '600'] as const;
export const technologySchema = z
  .object({
    availableMachines: z
      .array(z.string().min(1).max(256))
      .max(2000)
      .transform((ids) => [...new Set(ids)]),
    unlockedRecipes: z
      .array(z.string().min(1).max(256))
      .max(2000)
      .transform((ids) => [...new Set(ids)]),
    beltTier: z.number().int().min(1).max(6),
    pipeTier: z.number().int().min(1).max(2),
  })
  .strict();
export type TechnologyProfile = z.infer<typeof technologySchema>;

export function validateTechnology(
  value: unknown,
  catalog: Catalog,
): TechnologyProfile {
  const profile = technologySchema.parse(value);
  const machineIds = new Set(catalog.machines.map((m) => m.id));
  const recipeIds = new Set(catalog.recipes.map((r) => r.id));
  if (profile.availableMachines.some((id) => !machineIds.has(id)))
    throw new Error('Technologieprofil enthält eine unbekannte Maschine.');
  if (profile.unlockedRecipes.some((id) => !recipeIds.has(id)))
    throw new Error('Technologieprofil enthält ein unbekanntes Rezept.');
  return profile;
}
export function requireTechnology(
  recipe: CatalogRecipe,
  profile: TechnologyProfile,
): void {
  if (!profile.availableMachines.includes(recipe.machineId))
    throw new Error('Maschine nicht freigeschaltet: ' + recipe.machineId);
  if (!profile.unlockedRecipes.includes(recipe.id))
    throw new Error('Rezept nicht freigeschaltet: ' + recipe.name);
}
export function transportCapacity(
  catalog: Catalog,
  itemId: string,
  profile: TechnologyProfile,
): Rational {
  const pipe = catalog.items.find((i) => i.id === itemId)?.transport === 'pipe';
  return Rational.parse(
    (pipe
      ? PIPE_CAPACITIES[profile.pipeTier - 1]
      : BELT_CAPACITIES[profile.beltTier - 1])!,
  );
}
export function supplyLines(
  catalog: Catalog,
  itemId: string,
  rate: string,
  profile: TechnologyProfile,
): number {
  return Number(
    Rational.parseCanonical(rate)
      .divide(transportCapacity(catalog, itemId, profile))
      .ceil(),
  );
}
