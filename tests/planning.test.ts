import { expect, test } from 'vitest';
import { buildPlanDocument } from '../src/planning.js';
import fixture from '../fixtures/plan.synthetic.json';
import {
  syntheticCatalog,
  validateCatalog,
  type Catalog,
} from '../src/domain/catalog.js';

function chainFixture(first: string, second: string, extra: string[] = []) {
  const recipeIds = [`recipe-a`.padEnd(256, 'a'), `recipe-b`.padEnd(256, 'b')];
  const catalog: Catalog = {
    schemaVersion: 1,
    catalogVersion: 'id-boundary-fixture',
    provenance: { kind: 'synthetic', source: 'original test fixture' },
    items: [
      { id: 'raw', name: 'Raw', raw: true },
      ...[first, second, ...extra].map((id) => ({
        id,
        name: 'Made',
        raw: false,
      })),
    ],
    machines: [{ id: 'machine', name: 'Machine' }],
    recipes: [first, second, ...extra].map((itemId, index) => ({
      id: recipeIds[index] ?? `recipe-${index}`,
      name: 'Recipe',
      machineId: 'machine',
      durationSeconds: '60',
      inputs: [{ itemId: index === 0 ? 'raw' : first, quantity: '1' }],
      outputs: [{ itemId, quantity: '1' }],
    })),
  };
  const input = {
    schemaVersion: 1,
    production: {
      targets: [second, ...extra].map((itemId) => ({ itemId, rate: '1' })),
      recipes: Object.fromEntries(
        catalog.recipes.map((recipe) => [recipe.outputs[0]!.itemId, recipe.id]),
      ),
      imports: ['raw'],
    },
    layout: { footprint: { width: 32, depth: 32 }, floorHeight: 8, rows: 1 },
  };
  return { input, catalog: validateCatalog(catalog) };
}

test('a production document drives machine counts and shared footprint on generated stories', () => {
  const plan = buildPlanDocument(fixture, syntheticCatalog);
  expect(plan.production.imports).toEqual([
    { itemId: 'example:ore', rate: '45' },
  ]);
  expect(plan.production.nodes.map((n) => n.machineCount)).toEqual([5, 1, 1]);
  expect(plan.layout.floors).toHaveLength(3);
  expect(
    plan.layout.floors.every(
      (f) => f.footprint.width === 32 && f.footprint.depth === 32,
    ),
  ).toBe(true);
  expect(
    plan.layout.floors
      .flatMap((f) => f.blocks)
      .map((b) => b.block.machines.length),
  ).toEqual([5, 1, 1]);
  expect(plan.layout.liftCorridors).toHaveLength(2);
  expect(
    plan.layout.liftCorridors.every((c) => c.floorIndices.length >= 2),
  ).toBe(true);
  expect(plan.layout.provenance.physicalBuildability).toBe('not-verified');
  expect(
    plan.layout.floors
      .flatMap((floor) => floor.blocks)
      .map((block) => block.id),
  ).toEqual(plan.production.nodes.map((node) => node.itemId));
  expect(plan.layout.connections.map((connection) => connection.id)).toEqual([
    'example:ingot->example:plate',
    'example:ingot->example:rod',
  ]);
});

test('maps valid 256-character catalog IDs to bounded geometry IDs without changing production identities', () => {
  const first = 'a'.repeat(256),
    second = 'b'.repeat(256);
  const { input, catalog } = chainFixture(first, second);
  const plan = buildPlanDocument(input, catalog);
  expect(plan.production.nodes.map((node) => node.itemId)).toEqual([
    first,
    second,
  ]);
  expect(plan.layoutBindings.blocks).toEqual([
    { itemId: first, blockId: 'generated:block:0' },
    { itemId: second, blockId: 'generated:block:1' },
  ]);
  expect(plan.layoutBindings.connections).toEqual([
    {
      connectionId: 'generated:connection:0',
      fromItemId: first,
      toItemId: second,
    },
  ]);
  expect(plan.layout.connections[0]).toMatchObject({
    fromBlock: 'generated:block:0',
    toBlock: 'generated:block:1',
  });
  expect(buildPlanDocument(input, catalog)).toEqual(plan);
});

test('bounds combined connection IDs even when each retained block ID is individually valid', () => {
  const first = 'a'.repeat(70),
    second = 'b'.repeat(70);
  const { input, catalog } = chainFixture(first, second);
  const plan = buildPlanDocument(input, catalog);
  expect(plan.layoutBindings.blocks).toEqual([
    { itemId: first, blockId: first },
    { itemId: second, blockId: second },
  ]);
  expect(plan.layout.connections[0]!.id).toBe('generated:connection:0');
  expect(plan.layout.connections[0]).toMatchObject({
    fromBlock: first,
    toBlock: second,
  });
  expect(plan.layoutBindings.connections[0]).toMatchObject({
    fromItemId: first,
    toItemId: second,
  });
});

test('reserves crafted short IDs before assigning generated IDs and keeps bindings unique', () => {
  const first = 'a'.repeat(256),
    second = 'b'.repeat(256);
  const extras = ['generated:block:0', 'generated:block:1'];
  const { input, catalog } = chainFixture(first, second, extras);
  const plan = buildPlanDocument(input, catalog);
  const bindings = plan.layoutBindings.blocks;
  expect(bindings.find((binding) => binding.itemId === first)!.blockId).toBe(
    'generated:block:2',
  );
  expect(bindings.find((binding) => binding.itemId === second)!.blockId).toBe(
    'generated:block:3',
  );
  for (const itemId of extras)
    expect(bindings.find((binding) => binding.itemId === itemId)!.blockId).toBe(
      itemId,
    );
  expect(new Set(bindings.map((binding) => binding.blockId)).size).toBe(
    bindings.length,
  );
  expect(bindings.every((binding) => binding.blockId.length <= 128)).toBe(true);
  expect(
    new Set(plan.layout.connections.map((connection) => connection.id)).size,
  ).toBe(plan.layout.connections.length);
  expect(plan.layout.connections.map((connection) => connection.id)).toEqual([
    'generated:connection:0',
    'generated:connection:1',
    'generated:connection:2',
  ]);
  expect(
    plan.layout.connections.every((connection) => connection.id.length <= 128),
  ).toBe(true);
  expect(buildPlanDocument(input, catalog)).toEqual(plan);
  expect(
    buildPlanDocument(
      {
        ...input,
        production: {
          ...input.production,
          targets: [...input.production.targets].reverse(),
        },
      },
      {
        ...catalog,
        items: [...catalog.items].reverse(),
        recipes: [...catalog.recipes].reverse(),
      },
    ),
  ).toEqual(plan);
});
test('invalid documents or infeasible rooms fail instead of returning a partial layout', () => {
  expect(() =>
    buildPlanDocument({ ...fixture, schemaVersion: 2 }, syntheticCatalog),
  ).toThrow();
  expect(() =>
    buildPlanDocument(
      {
        ...fixture,
        layout: { ...fixture.layout, footprint: { width: 2, depth: 2 } },
      },
      syntheticCatalog,
    ),
  ).toThrow();
});
