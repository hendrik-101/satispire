import { expect, test } from 'vitest';
import { convertDiscovery } from '../src/discovery.js';
import { solveProduction } from '../src/domain/production.js';

test('retains liquid and gas transport for technology capacity sizing', () => {
  const input = discoveryFixture();
  input.items[0]!.form = 'RF_LIQUID';
  input.items[1]!.form = 'RF_GAS';
  input.recipes[0]!.durationSeconds = 0.1;
  const { catalog } = convertDiscovery(input);
  expect(catalog.items.map((item) => item.transport)).toEqual(['pipe', 'pipe']);
  const plan = solveProduction(catalog, {
    targets: [{ itemId: 'test:part', rate: '600' }],
    recipes: { 'test:part': catalog.recipes[0]!.id },
    imports: ['test:ore'],
    technology: {
      availableMachines: ['test:machine'],
      unlockedRecipes: [catalog.recipes[0]!.id],
      beltTier: 1,
      pipeTier: 2,
    },
  });
  expect(plan.nodes[0]!.machineCount).toBe(2);
});

export function discoveryFixture() {
  return {
    manifest: {
      schemaVersion: 'satispire.discovery/0.1',
      catalogVersion: 'local-test-1',
      game: { version: 'test-1', changelist: 123 },
      source: { sha256: 'a'.repeat(64) },
    },
    items: [
      {
        id: 'test:ore',
        form: 'RF_SOLID',
        provenance: { nativeClass: 'FGResourceDescriptor' },
      },
      {
        id: 'test:part',
        form: 'RF_SOLID',
        provenance: { nativeClass: 'FGItemDescriptor' },
      },
    ],
    buildings: [{ id: 'test:machine', parameters: { mManufacturingSpeed: 2 } }],
    recipes: [
      {
        id: 'test:recipe',
        durationSeconds: 12,
        ingredients: [{ itemId: 'test:ore', quantity: 3 }],
        products: [{ itemId: 'test:part', quantity: 2 }],
        eligibleProducers: [{ id: 'test:machine', kind: 'buildable' }],
        alternate: false,
        events: null,
        unlockIds: ['test:unlock'],
      },
    ],
  };
}

test('converts declared manufacturing speed and exact rate without certifying geometry', () => {
  const result = convertDiscovery(discoveryFixture());
  expect(result.catalog.provenance.kind).toBe('unverified-game');
  expect(result.catalog.provenance.manifest?.license).toBe(
    'unresolved-local-only',
  );
  const recipe = result.catalog.recipes[0]!;
  expect(recipe.durationSeconds).toBe('6');
  const plan = solveProduction(result.catalog, {
    targets: [{ itemId: 'test:part', rate: '20' }],
    recipes: { 'test:part': recipe.id },
    imports: ['test:ore'],
  });
  expect(plan.imports).toEqual([{ itemId: 'test:ore', rate: '30' }]);
  expect(plan.nodes[0]?.machineCount).toBe(1);
  expect(result.catalog.items.find((x) => x.id === 'test:part')?.raw).toBe(
    false,
  );
  expect(result.details[recipe.id]?.layoutReady).toBe(false);
});

test('keeps producer choices, alternate and event gates visible', () => {
  const input = discoveryFixture();
  input.buildings.push({
    id: 'test:other',
    parameters: { mManufacturingSpeed: 1 },
  });
  input.recipes[0]!.eligibleProducers.push({
    id: 'test:other',
    kind: 'buildable',
  });
  input.recipes[0]!.alternate = true;
  const result = convertDiscovery(input);
  expect(result.catalog.recipes).toHaveLength(2);
  expect(Object.values(result.details).every((x) => x.alternate)).toBe(true);
});

test('reports unresolved recipe quantities instead of silently changing material balance', () => {
  const input = discoveryFixture();
  input.recipes[0]!.ingredients[0]!.itemId = 'missing:item';
  const result = convertDiscovery(input);
  expect(result.catalog.recipes).toHaveLength(0);
  expect(result.excluded[0]?.reason).toMatch(/unresolved/);
});

test('rejects unsupported source version and invalid metadata', () => {
  const input = discoveryFixture();
  input.manifest.schemaVersion = 'future';
  expect(() => convertDiscovery(input)).toThrow();
  const invalid = discoveryFixture();
  invalid.manifest.source.sha256 = 'invalid';
  expect(() => convertDiscovery(invalid)).toThrow();
});

test('does not treat an absent manufacturer speed as 1', () => {
  const input = discoveryFixture();
  input.buildings[0]!.parameters.mManufacturingSpeed = 0;
  const result = convertDiscovery(input);
  expect(result.catalog.recipes).toHaveLength(0);
  expect(result.excluded[0]?.reason).toMatch(/speed/);
});
