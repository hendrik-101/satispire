import {
  vanillaSnapshot,
  recipeUnlocks,
  machineUnlocks,
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
    beltTier:
      tier >= 9
        ? 6
        : tier >= 7
          ? 5
          : tier >= 5
            ? 4
            : tier >= 4
              ? 3
              : tier >= 2
                ? 2
                : 1,
    pipeTier: tier >= 6 ? 2 : 1,
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
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const recipe of availableRecipes(profile).sort(
    (a, b) =>
      Number(recipeUnlocks[a.id]!.alternate) -
      Number(recipeUnlocks[b.id]!.alternate),
  )) {
    const id = recipe.outputs[0]!.itemId;
    result[id] ??= recipe.id;
  }
  return result;
}
export function itemName(id: string): string {
  return (
    vanillaCatalog.items.find((i) => i.id === id)?.name ??
    vanillaCatalog.machines.find((i) => i.id === id)?.name ??
    id
  );
}
