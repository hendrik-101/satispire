import {
  vanillaSnapshot,
  recipeUnlocks,
  machineUnlocks,
  transportUnlocks,
} from '../data/vanilla-snapshot.js';
import { validateCatalog } from './catalog.js';
import { type TechnologyProfile } from './technology.js';

export const vanillaCatalog = validateCatalog(vanillaSnapshot);
export { recipeUnlocks, machineUnlocks };
export function technologyAtTier(
  tier: number,
  extraRecipes: string[] = [],
): TechnologyProfile {
  if (!Number.isSafeInteger(tier) || tier < 0 || tier > 9)
    throw new Error('Ungültige Technologiestufe');
  if (
    extraRecipes.some((id) => !vanillaCatalog.recipes.some((r) => r.id === id))
  )
    throw new Error('Unbekannte Rezeptfreischaltung');
  return {
    availableMachines: vanillaCatalog.machines
      .filter(
        (m) =>
          machineUnlocks[m.id] !== null && (machineUnlocks[m.id] ?? 10) <= tier,
      )
      .map((m) => m.id),
    unlockedRecipes: vanillaCatalog.recipes
      .filter((r) => {
        const unlock = recipeUnlocks[r.id]!;
        return (
          (!unlock.alternate && unlock.tier !== null && unlock.tier <= tier) ||
          extraRecipes.includes(r.id)
        );
      })
      .map((r) => r.id),
    beltTier: Math.max(
      1,
      transportUnlocks.belt.filter((unlock) => unlock <= tier).length,
    ),
    pipeTier: Math.max(
      1,
      transportUnlocks.pipe.filter((unlock) => unlock <= tier).length,
    ),
  };
}
export function availableRecipes(profile: TechnologyProfile) {
  return vanillaCatalog.recipes.filter(
    (r) =>
      r.outputs.length === 1 &&
      !vanillaCatalog.items.find((i) => i.id === r.outputs[0]!.itemId)!.raw &&
      profile.availableMachines.includes(r.machineId) &&
      profile.unlockedRecipes.includes(r.id),
  );
}
export function availableChoices(
  profile: TechnologyProfile,
  imports: string[] = vanillaCatalog.items
    .filter((i) => i.raw)
    .map((i) => i.id),
): Record<string, string> {
  const result: Record<string, string> = {};
  const recipes = availableRecipes(profile).sort(
    (a, b) =>
      Number(recipeUnlocks[a.id]!.alternate) -
      Number(recipeUnlocks[b.id]!.alternate),
  );
  const raw = new Set(
    vanillaCatalog.items.filter((i) => i.raw).map((i) => i.id),
  );
  const imported = new Set(imports);
  if (imports.some((id) => !raw.has(id)))
    throw new Error('Import policy must contain raw catalog items');
  function resolve(itemId: string, ancestors: Set<string>): boolean {
    if (imported.has(itemId)) return true;
    if (raw.has(itemId)) return false;
    if (ancestors.has(itemId)) return false;
    if (result[itemId]) return true;
    const path = new Set([...ancestors, itemId]);
    for (const recipe of recipes.filter(
      (r) => r.outputs[0]!.itemId === itemId,
    )) {
      if (recipe.inputs.every((input) => resolve(input.itemId, path))) {
        result[itemId] = recipe.id;
        return true;
      }
    }
    return false;
  }
  for (const recipe of recipes) resolve(recipe.outputs[0]!.itemId, new Set());
  return result;
}
export function itemName(id: string): string {
  return (
    vanillaCatalog.items.find((i) => i.id === id)?.name ??
    vanillaCatalog.machines.find((i) => i.id === id)?.name ??
    id
  );
}
