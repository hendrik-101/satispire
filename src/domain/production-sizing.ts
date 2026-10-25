import type { Catalog } from './catalog.js';
import {
  scaleProductionByFactor,
  solveProduction,
  type ItemRate,
  type ProductionInput,
  type ProductionPlan,
} from './production.js';
import { Rational } from './rational.js';

export type ProductionSizingScope =
  | { scope: 'factory' }
  | { scope: 'stage'; stageItemId: string };
export type ProductionInputSizing = ProductionSizingScope & ItemRate;

/** Consumption excludes independent target deliveries of the same material. */
export function productionSizingInputs(
  plan: ProductionPlan,
  scope: ProductionSizingScope,
): ItemRate[] {
  if (scope.scope === 'stage')
    return (
      plan.nodes.find((node) => node.itemId === scope.stageItemId)?.inputs ?? []
    ).map((input) => ({ ...input }));
  const totals = new Map<string, Rational>();
  for (const node of plan.nodes)
    for (const input of node.inputs)
      totals.set(
        input.itemId,
        (totals.get(input.itemId) ?? Rational.parse('0')).add(
          Rational.parseCanonical(input.rate),
        ),
      );
  const itemIds = new Set([
    ...plan.imports.map((input) => input.itemId),
    ...[...totals.keys()].sort(),
  ]);
  return [...itemIds]
    .filter((itemId) => totals.has(itemId))
    .map((itemId) => ({ itemId, rate: totals.get(itemId)!.toString() }));
}

/** Both scopes scale every target, preserving their proportions and first order. */
export function sizeProductionByInput(
  catalog: Catalog,
  input: ProductionInput,
  request: ProductionInputSizing,
): { input: ProductionInput; plan: ProductionPlan } {
  const current = solveProduction(catalog, input);
  if (
    request.scope === 'stage' &&
    !current.nodes.some((node) => node.itemId === request.stageItemId)
  )
    throw new Error(
      'Die gewählte Produktionsstufe ist nicht im Plan enthalten.',
    );
  const anchor = productionSizingInputs(current, request).find(
    (entry) => entry.itemId === request.itemId,
  );
  if (!anchor)
    throw new Error('Bitte einen Input des gewählten Verbrauchs wählen.');
  const desired = Rational.parse(request.rate);
  if (desired.compare(Rational.parse('0')) <= 0)
    throw new Error('Die Inputrate muss positiv sein.');
  const factor = desired.divide(Rational.parseCanonical(anchor.rate));
  const plan = scaleProductionByFactor(catalog, input, factor);
  const targets = [
    ...new Set(input.targets.map((target) => target.itemId)),
  ].map((itemId) => ({
    ...plan.targets.find((target) => target.itemId === itemId)!,
  }));
  return { input: { ...input, targets }, plan };
}
