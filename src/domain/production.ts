import {
  validateTechnology,
  requireTechnology,
  transportCapacity,
  type TechnologyProfile,
} from './technology.js';
import {
  validateCatalog,
  type Catalog,
  type CatalogRecipe,
} from './catalog.js';
import { Rational } from './rational.js';

export interface ItemRate {
  itemId: string;
  rate: string;
}
export interface ProductionInput {
  targets: ItemRate[];
  recipes: Record<string, string>;
  imports: string[];
  technology?: TechnologyProfile | undefined;
}
export interface ProductionNode extends ItemRate {
  recipeId: string;
  machineId: string;
  craftsPerMinute: string;
  machineCount: number;
  utilization: string;
  inputs: ItemRate[];
}
export interface ProductionPlan {
  schemaVersion: 1;
  catalogVersion: string;
  targets: ItemRate[];
  nodes: ProductionNode[];
  imports: ItemRate[];
}

const ZERO = Rational.parse('0');
const SIXTY = Rational.parse('60');
export const INPUT_ENTRY_LIMIT = 2000;
export const MACHINE_COUNT_LIMIT = 1_000_000;

function applyFactor(
  catalog: Catalog,
  input: ProductionInput,
  factor: Rational,
): ProductionPlan {
  return solveExactProduction(catalog, input, factor);
}

/** Applies an already computed exact factor without reparsing it as user input. */
export function scaleProductionByFactor(
  catalog: Catalog,
  input: ProductionInput,
  factor: Rational,
): ProductionPlan {
  if (factor.compare(ZERO) <= 0)
    throw new Error('Production scale factor must be positive');
  return applyFactor(catalog, input, factor);
}

/** Applies an exact factor to all targets, anchored to total demand for one item. */
export function scaleProduction(
  catalog: Catalog,
  input: ProductionInput,
  anchor: ItemRate,
): ProductionPlan {
  const plan = solveProduction(catalog, input);
  const selection = object(anchor, 'scale anchor');
  supportedKeys(selection, ['itemId', 'rate'], 'scale anchor');
  const existing = [...plan.nodes, ...plan.imports].find(
    (entry) => entry.itemId === selection.itemId,
  );
  if (!existing)
    throw new Error(
      `Scale anchor ${String(selection.itemId)} is not in the production plan`,
    );
  const desired = Rational.parse(selection.rate as string);
  if (desired.compare(ZERO) <= 0)
    throw new Error('Scale anchor rate must be positive');
  const current = Rational.parseCanonical(existing.rate);
  if (current.compare(ZERO) <= 0)
    throw new Error('Scale anchor existing rate must be positive');
  return applyFactor(catalog, input, desired.divide(current));
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** Smallest rational factor >= 1 giving full machines and chosen count multiples. */
export function perfectRatio(
  catalog: Catalog,
  input: ProductionInput,
  options: { multiples?: Record<string, number> } = {},
): ProductionPlan {
  const data = validateCatalog(catalog);
  const plan = solveProduction(data, input);
  if (input.technology) {
    for (const node of plan.nodes) {
      const recipe = data.recipes.find((r) => r.id === node.recipeId)!;
      const fullCrafts = SIXTY.divide(
        Rational.parseCanonical(recipe.durationSeconds),
      );
      if (
        [...recipe.inputs, ...recipe.outputs].some(
          (part) =>
            fullCrafts
              .multiply(Rational.parseCanonical(part.quantity))
              .compare(
                transportCapacity(data, part.itemId, input.technology!),
              ) > 0,
        )
      )
        throw new Error(
          'Perfect Ratio conflicts with the selected transport capacity: ' +
            recipe.name,
        );
    }
  }
  const settings = object(options, 'Perfect Ratio options');
  supportedKeys(settings, ['multiples'], 'Perfect Ratio options');
  const multiples =
    settings.multiples === undefined
      ? {}
      : object(settings.multiples, 'building multiples');
  const active = new Set(plan.nodes.map((node) => node.recipeId));
  if (Object.keys(multiples).length > INPUT_ENTRY_LIMIT)
    throw new Error('Building multiples exceed the input entry bound');
  for (const [recipeId, multiple] of Object.entries(multiples)) {
    if (!active.has(recipeId))
      throw new Error(
        `Building multiple constraint references inactive recipe ${recipeId}`,
      );
    if (
      typeof multiple !== 'number' ||
      !Number.isSafeInteger(multiple) ||
      multiple <= 0 ||
      multiple > MACHINE_COUNT_LIMIT
    )
      throw new Error(
        `Building multiple for ${recipeId} must be a positive integer within the ${MACHINE_COUNT_LIMIT} bound`,
      );
  }
  if (plan.nodes.length === 0) return plan;
  let numeratorGcd = 0n;
  let denominatorLcm = 1n;
  for (const node of plan.nodes) {
    const multiple = (multiples[node.recipeId] ?? 1) as number;
    const required = Rational.parseCanonical(node.utilization)
      .multiply(Rational.fromBigInts(BigInt(node.machineCount)))
      .divide(Rational.fromBigInts(BigInt(multiple)));
    const [numerator, denominator = '1'] = required.toString().split('/');
    numeratorGcd = gcd(numeratorGcd, BigInt(numerator!));
    const d = BigInt(denominator);
    denominatorLcm = (denominatorLcm / gcd(denominatorLcm, d)) * d;
    Rational.fromBigInts(denominatorLcm);
  }
  const primitive = Rational.fromBigInts(denominatorLcm, numeratorGcd);
  const repeats = Rational.parse('1').divide(primitive).ceil();
  const factor = primitive.multiply(Rational.fromBigInts(repeats));
  return applyFactor(catalog, input, factor);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function supportedKeys(
  value: Record<string, unknown>,
  keys: string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key))
      throw new Error(`${path}: unsupported field ${key}`);
  }
}

function sortedIds(ids: Iterable<string>): string[] {
  return [...ids].sort();
}

function sortedRates(rates: Map<string, Rational>): ItemRate[] {
  return sortedIds(rates.keys()).map((itemId) => ({
    itemId,
    rate: rates.get(itemId)!.toString(),
  }));
}

/** Solves a selected single-output DAG in exact items/minute. */
export function solveProduction(
  catalog: Catalog,
  input: ProductionInput,
): ProductionPlan {
  return solveExactProduction(catalog, input);
}

function solveExactProduction(
  catalog: Catalog,
  input: ProductionInput,
  factor?: Rational,
): ProductionPlan {
  const data = validateCatalog(catalog);
  const request = object(input, 'production input');
  supportedKeys(
    request,
    ['targets', 'recipes', 'imports', 'technology'],
    'production input',
  );
  const technology =
    request.technology === undefined
      ? undefined
      : validateTechnology(request.technology, data);
  if (
    !Array.isArray(request.targets) ||
    request.targets.length === 0 ||
    request.targets.length > INPUT_ENTRY_LIMIT
  )
    throw new Error(`targets must contain 1 to ${INPUT_ENTRY_LIMIT} entries`);
  if (
    !Array.isArray(request.imports) ||
    request.imports.length > INPUT_ENTRY_LIMIT
  )
    throw new Error(
      `imports must be an array within the ${INPUT_ENTRY_LIMIT}-entry bound`,
    );
  const choices = object(request.recipes, 'recipes choices');
  if (Object.keys(choices).length > INPUT_ENTRY_LIMIT)
    throw new Error('recipes choices exceed the input entry bound');
  const items = new Map(data.items.map((item) => [item.id, item]));
  const recipes = new Map(data.recipes.map((recipe) => [recipe.id, recipe]));

  function requireItem(value: unknown, path: string): string {
    if (typeof value !== 'string' || !items.has(value))
      throw new Error(`${path}: unknown item ${String(value)}`);
    return value;
  }
  const imports = new Set<string>();
  for (const imported of request.imports) {
    const itemId = requireItem(imported, 'imports');
    if (!items.get(itemId)!.raw)
      throw new Error(`Only raw items may be imported: ${itemId}`);
    imports.add(itemId);
  }
  const selected = new Map<string, CatalogRecipe>();
  for (const itemId of sortedIds(Object.keys(choices))) {
    requireItem(itemId, 'recipes choices');
    if (items.get(itemId)!.raw)
      throw new Error(
        `Raw item ${itemId} requires import instead of a recipe choice`,
      );
    const recipeId = choices[itemId];
    if (typeof recipeId !== 'string' || !recipes.has(recipeId))
      throw new Error(
        `Unknown selected recipe for ${itemId}: ${String(recipeId)}`,
      );
    const recipe = recipes.get(recipeId)!;
    if (!recipe.outputs.some((output) => output.itemId === itemId))
      throw new Error(`Recipe ${recipeId} does not output ${itemId}`);
    selected.set(itemId, recipe);
  }
  const targets = new Map<string, Rational>();
  for (const targetValue of request.targets) {
    const target = object(targetValue, 'targets entry');
    supportedKeys(target, ['itemId', 'rate'], 'targets entry');
    const itemId = requireItem(target.itemId, 'targets');
    let rate: Rational;
    try {
      const original = Rational.parse(target.rate as string);
      rate = factor === undefined ? original : original.multiply(factor);
    } catch (error) {
      throw new Error(
        `Target ${itemId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (rate.compare(ZERO) <= 0)
      throw new Error(`Target ${itemId} rate must be positive`);
    targets.set(itemId, (targets.get(itemId) ?? ZERO).add(rate));
  }

  // DFS postorder produces prerequisites first. Reversal propagates total demand
  // from every consumer before visiting any shared prerequisite.
  const states = new Map<string, 'visiting' | 'visited'>();
  const order: string[] = [];
  const path: string[] = [];
  function visit(itemId: string): void {
    if (states.get(itemId) === 'visited') return;
    if (states.get(itemId) === 'visiting') {
      const start = path.indexOf(itemId);
      throw new Error(
        `Selected recipe cycle: ${[...path.slice(start), itemId].join(' -> ')}`,
      );
    }
    states.set(itemId, 'visiting');
    path.push(itemId);
    if (items.get(itemId)!.raw) {
      if (!imports.has(itemId))
        throw new Error(`Raw item ${itemId} requires an explicit import`);
    } else {
      const recipe = selected.get(itemId);
      if (!recipe)
        throw new Error(`Choose an explicit selected recipe for ${itemId}`);
      if (technology) requireTechnology(recipe, technology);
      if (recipe.outputs.length !== 1)
        throw new Error(
          `Coproduct recipe ${recipe.id} is unsupported; select a single-output recipe`,
        );
      for (const dependency of sortedIds(
        recipe.inputs.map((entry) => entry.itemId),
      ))
        visit(dependency);
    }
    path.pop();
    states.set(itemId, 'visited');
    order.push(itemId);
  }
  for (const itemId of sortedIds(targets.keys())) visit(itemId);

  const demands = new Map(targets);
  const importedRates = new Map<string, Rational>();
  const nodes: ProductionNode[] = [];
  for (const itemId of order.reverse()) {
    const demand = demands.get(itemId)!;
    if (imports.has(itemId)) {
      importedRates.set(itemId, demand);
      continue;
    }
    const recipe = selected.get(itemId)!;
    const crafts = demand.divide(
      Rational.parseCanonical(recipe.outputs[0]!.quantity),
    );
    const machineDemand = crafts
      .multiply(Rational.parseCanonical(recipe.durationSeconds))
      .divide(SIXTY);
    let count = machineDemand.ceil();
    if (technology) {
      for (const part of [...recipe.inputs, ...recipe.outputs]) {
        const rate = crafts.multiply(Rational.parseCanonical(part.quantity));
        const supplied = rate
          .divide(transportCapacity(data, part.itemId, technology))
          .ceil();
        if (supplied > count) count = supplied;
      }
    }
    if (count > BigInt(MACHINE_COUNT_LIMIT))
      throw new Error(
        `Machine count for ${itemId} exceeds the ${MACHINE_COUNT_LIMIT} limit`,
      );
    const rates = new Map<string, Rational>();
    for (const dependency of recipe.inputs) {
      const rate = crafts.multiply(
        Rational.parseCanonical(dependency.quantity),
      );
      rates.set(dependency.itemId, rate);
      demands.set(
        dependency.itemId,
        (demands.get(dependency.itemId) ?? ZERO).add(rate),
      );
    }
    nodes.push({
      itemId,
      recipeId: recipe.id,
      machineId: recipe.machineId,
      rate: demand.toString(),
      craftsPerMinute: crafts.toString(),
      machineCount: Number(count),
      utilization: machineDemand
        .divide(Rational.parse(count.toString()))
        .toString(),
      inputs: sortedRates(rates),
    });
  }
  nodes.sort((a, b) =>
    a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0,
  );
  return {
    schemaVersion: 1,
    catalogVersion: data.catalogVersion,
    targets: sortedRates(targets),
    nodes,
    imports: sortedRates(importedRates),
  };
}
