import { type Catalog } from '../../src/domain/catalog.js';
import {
  type ItemRate,
  type ProductionInput,
  scaleProduction,
  solveProduction,
} from '../../src/domain/production.js';
import { Rational } from '../../src/domain/rational.js';
import type { DiscoveryRecipeDetails } from '../../src/discovery.js';

/** Normalizes UI rates and sizes the selected chain without changing the last valid input. */
export function calculateProduction(
  catalog: Catalog,
  input: ProductionInput,
  target: ItemRate | ItemRate[],
  anchor?: ItemRate,
) {
  const primary = Array.isArray(target) ? target[0] : target;
  const preservePrimaryDemand =
    !Array.isArray(target) &&
    anchor !== undefined &&
    input.targets[0]?.itemId === target.itemId;
  const next: ProductionInput = {
    ...input,
    targets: Array.isArray(target)
      ? target.map((entry) => ({
          ...entry,
          rate: Rational.parse(entry.rate.trim().replace(',', '.')).toString(),
        }))
      : [
          {
            itemId: target.itemId,
            rate: Rational.parse(
              target.rate.trim().replace(',', '.'),
            ).toString(),
          },
          ...input.targets
            .slice(1)
            .filter((t) => preservePrimaryDemand || t.itemId !== target.itemId),
        ],
  };
  let plan = solveProduction(catalog, next);
  if (anchor) {
    if (!plan.imports.some((entry) => entry.itemId === anchor.itemId))
      throw new Error(
        'Bitte einen Eingang der gewählten Produktionskette wählen.',
      );
    plan = scaleProduction(catalog, next, {
      ...anchor,
      rate: Rational.parse(anchor.rate.trim().replace(',', '.')).toString(),
    });
    next.targets = Array.isArray(target)
      ? [...new Set(target.map((entry) => entry.itemId))].map(
          (itemId) => plan.targets.find((entry) => entry.itemId === itemId)!,
        )
      : [
          plan.targets.find((entry) => entry.itemId === primary!.itemId)!,
          ...plan.targets.filter((entry) => entry.itemId !== primary!.itemId),
        ];
  }
  return { input: next, plan };
}

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
