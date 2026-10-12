import { type Catalog } from '../../src/domain/catalog.js';
import {
  type ProductionInput,
  solveProduction,
} from '../../src/domain/production.js';
import type { DiscoveryRecipeDetails } from '../../src/discovery.js';

export function defaultChoices(
  catalog: Catalog,
  details: Record<string, DiscoveryRecipeDetails>,
) {
  const result: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const item of catalog.items.filter((item) => !item.raw)) {
    const choices = catalog.recipes.filter(
      (recipe) =>
        recipe.outputs.length === 1 && recipe.outputs[0]?.itemId === item.id,
    );
    const preferred =
      choices.find(
        (recipe) =>
          !details[recipe.id]?.alternate &&
          !details[recipe.id]?.eventRestricted,
      ) ?? choices[0];
    if (preferred) result[item.id] = preferred.id;
  }
  return result;
}
export function initialProduction(
  catalog: Catalog,
  details: Record<string, DiscoveryRecipeDetails>,
): ProductionInput {
  const recipes = defaultChoices(catalog, details);
  const target =
    catalog.items.find(
      (item) => item.id === 'Desc_IronPlate_C' && recipes[item.id],
    ) ??
    catalog.items.find(
      (item) => item.id === 'example:plate' && recipes[item.id],
    ) ??
    catalog.items.find((item) => recipes[item.id]);
  if (!target || !recipes[target.id])
    throw new Error('Kein unterstütztes Produktionsziel im Import.');
  const input = {
    targets: [{ itemId: target.id, rate: '20' }],
    recipes,
    imports: catalog.items.filter((item) => item.raw).map((item) => item.id),
  };
  solveProduction(catalog, input);
  return input;
}
export function displayName(id: string): string {
  return id
    .replace(/^(Desc_|Build_|Recipe_|example:)/, '')
    .replace(/_C$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function graphConnections(
  plan: import('../../src/domain/production.js').ProductionPlan,
) {
  return plan.nodes.flatMap((node) =>
    node.inputs.map((input) => ({
      from: input.itemId,
      to: node.itemId,
      rate: input.rate,
    })),
  );
}
