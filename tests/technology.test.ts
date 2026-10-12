import { describe, expect, it } from 'vitest';
import { syntheticCatalog } from '../src/domain/catalog.js';
import { solveProduction, scaleProduction } from '../src/domain/production.js';
import { productionSchema } from '../src/inputs.js';

const technology = {
  availableMachines: syntheticCatalog.machines.map((m) => m.id),
  unlockedRecipes: syntheticCatalog.recipes.map((r) => r.id),
  beltTier: 1,
  pipeTier: 1,
};
const input = {
  targets: [{ itemId: 'example:plate', rate: '200' }],
  recipes: {
    'example:plate': 'example:press',
    'example:ingot': 'example:smelt',
  },
  imports: ['example:ore'],
  technology,
};
describe('technology constraints in shared solver', () => {
  it('rejects a locked machine in an active upstream stage', () => {
    expect(() =>
      solveProduction(syntheticCatalog, {
        ...input,
        technology: { ...technology, availableMachines: [] },
      }),
    ).toThrow(/machine|Maschine/i);
  });
  it('rejects locked recipes even when selected directly by an adapter', () => {
    expect(() =>
      solveProduction(syntheticCatalog, {
        ...input,
        technology: { ...technology, unlockedRecipes: ['example:press'] },
      }),
    ).toThrow(/recipe|Rezept/i);
  });
  it('dimensions machine count for the selected transport capacity', () => {
    // A deliberately high-throughput machine needs more instances to stay within Mk.1 supply.
    const catalog = {
      ...syntheticCatalog,
      recipes: syntheticCatalog.recipes.map((r) => ({
        ...r,
        durationSeconds: '0.1',
      })),
    };
    const low = solveProduction(catalog, input);
    const high = solveProduction(catalog, {
      ...input,
      technology: { ...technology, beltTier: 2 },
    });
    expect(
      low.nodes.find((n) => n.itemId === 'example:plate')!.machineCount,
    ).toBe(5);
    expect(
      high.nodes.find((n) => n.itemId === 'example:plate')!.machineCount,
    ).toBe(3);
    expect(
      scaleProduction(catalog, input, {
        itemId: 'example:plate',
        rate: '400',
      }).nodes.find((n) => n.itemId === 'example:plate')!.machineCount,
    ).toBe(10);
  });
  it('validates bounded profiles through the common adapter schema', () => {
    expect(productionSchema.parse(input)).toEqual(input);
    expect(() =>
      solveProduction(syntheticCatalog, {
        ...input,
        technology: { ...technology, beltTier: 7 },
      }),
    ).toThrow();
  });
});
it('reports incompatible full-machine ratios instead of returning underutilized machines', async () => {
  const { perfectRatio } = await import('../src/domain/production.js');
  const catalog = {
    ...syntheticCatalog,
    recipes: syntheticCatalog.recipes.map((r) => ({
      ...r,
      durationSeconds: '0.1',
    })),
  };
  expect(() => perfectRatio(catalog, input)).toThrow(/transport|Transport/);
});
it('normalizes bounded repeated technology IDs before repeated solver probes', async () => {
  const { technologySchema, validateTechnology } = await import(
    '../src/domain/technology.js'
  );
  const duplicated = {
    ...technology,
    availableMachines: Array.from(
      { length: 2000 },
      () => technology.availableMachines[0]!,
    ),
    unlockedRecipes: Array.from(
      { length: 2000 },
      () => technology.unlockedRecipes[0]!,
    ),
  };
  const expected = {
    ...technology,
    availableMachines: [technology.availableMachines[0]!],
    unlockedRecipes: [technology.unlockedRecipes[0]!],
  };
  expect(technologySchema.parse(duplicated)).toEqual(expected);
  expect(validateTechnology(duplicated, syntheticCatalog)).toEqual(expected);
  expect(
    productionSchema.parse({ ...input, technology: duplicated }).technology,
  ).toEqual(expected);
  expect(duplicated.availableMachines).toHaveLength(2000);
  expect(() =>
    validateTechnology(
      {
        ...expected,
        unlockedRecipes: [...expected.unlockedRecipes, 'not-known'],
      },
      syntheticCatalog,
    ),
  ).toThrow(/unbekanntes Rezept/);
  expect(() =>
    validateTechnology(
      {
        ...expected,
        availableMachines: [...expected.availableMachines, 'not-known'],
      },
      syntheticCatalog,
    ),
  ).toThrow(/unbekannte Maschine/);
  expect(() =>
    technologySchema.parse({
      ...duplicated,
      unlockedRecipes: [...duplicated.unlockedRecipes, 'not-known'],
    }),
  ).toThrow();
});
