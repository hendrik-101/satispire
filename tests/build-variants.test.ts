import { expect, it } from 'vitest';
import {
  deriveBuildVariants,
  defaultBuildVariant,
} from '../src/domain/build-variants.js';
import type { ProductionPlan } from '../src/domain/production.js';
const node = (itemId: string, inputs: string[]) => ({
  itemId,
  inputs: inputs.map((itemId) => ({ itemId, rate: '1' })),
  rate: '1',
  recipeId: 'r',
  machineId: 'm',
  craftsPerMinute: '1',
  machineCount: 1,
  utilization: '1',
});
const plan: ProductionPlan = {
  schemaVersion: 1,
  catalogVersion: 'test',
  targets: [{ itemId: 'a', rate: '1' }],
  imports: [
    { itemId: 'ore', rate: '1' },
    { itemId: 'coal', rate: '1' },
  ],
  nodes: [
    node('a', ['b', 'ore', 'coal']),
    node('b', ['c']),
    node('c', ['ore']),
  ],
};
it('orders dependencies first and alternates west/east then east/west', () => {
  const result = deriveBuildVariants(plan);
  expect(
    result.floors.map((f) => [f.itemId, f.inputSide, f.outputSide]),
  ).toEqual([
    ['c', 'west', 'east'],
    ['b', 'east', 'west'],
    ['a', 'west', 'east'],
  ]);
  expect(
    result.transfers.map((t) => [
      t.fromItemId,
      t.toItemId,
      t.side,
      t.sideChanges,
    ]),
  ).toEqual([
    ['c', 'b', 'east', 0],
    ['b', 'a', 'west', 0],
  ]);
  expect(result.transfers[0]).toMatchObject({
    fromFloor: 0,
    toFloor: 1,
    span: [0, 1],
  });
  expect(
    deriveBuildVariants({ ...plan, nodes: [...plan.nodes].reverse() }),
  ).toEqual(result);
  expect(result.variant).toEqual(defaultBuildVariant);
});
it('bundles every external input on the destination input side without inventing lifts', () => {
  const result = deriveBuildVariants(plan);
  expect(result.floors[2]!.inputs).toEqual([
    { itemId: 'b', rate: '1', side: 'west', sourceFloor: 1 },
    { itemId: 'coal', rate: '1', side: 'west', sourceFloor: null },
    { itemId: 'ore', rate: '1', side: 'west', sourceFloor: null },
  ]);
  expect(result.transfers).toHaveLength(2);
});
it.each(['west', 'east', 'north', 'south'] as const)(
  'supports both connectors on %s with distinct transfer identities',
  (side) => {
    const result = deriveBuildVariants(plan, {
      ...defaultBuildVariant,
      pattern: 'fixed',
      inputSide: side,
      outputSide: side,
    });
    expect(
      result.floors.every((f) => f.inputSide === side && f.outputSide === side),
    ).toBe(true);
    expect(result.transfers.map((t) => t.slot)).toEqual([0, 1]);
    expect(
      result.transfers.every((t) => t.side === side && t.sideChanges === 0),
    ).toBe(true);
  },
);
it('handles top/bottom direction and explicit floor overrides', () => {
  const result = deriveBuildVariants(plan, {
    ...defaultBuildVariant,
    inputSide: 'north',
    outputSide: 'south',
    overrides: [{ itemId: 'b', inputSide: 'west', outputSide: 'west' }],
  });
  expect(result.floors.map((f) => [f.inputSide, f.outputSide])).toEqual([
    ['north', 'south'],
    ['west', 'west'],
    ['north', 'south'],
  ]);
  expect(result.transfers.every((t) => t.sideChanges === 1)).toBe(true);
});
it('reserves a bypass across intermediate floors and reports unavoidable side changes', () => {
  const result = deriveBuildVariants({
    ...plan,
    nodes: [node('a', ['b', 'c']), node('b', ['c']), node('c', ['ore'])],
  });
  const bypass = result.transfers.find(
    (t) => t.fromItemId === 'c' && t.toItemId === 'a',
  )!;
  expect(bypass).toMatchObject({
    fromFloor: 0,
    toFloor: 2,
    side: 'east',
    sideChanges: 2,
    span: [0, 1, 2],
  });
  expect(result.transfers.map((t) => t.id).length).toBe(
    new Set(result.transfers.map((t) => t.id)).size,
  );
});
it('rejects malformed or stale overrides, duplicate stages, unknown feeds and cycles', () => {
  for (const variant of [
    {
      ...defaultBuildVariant,
      overrides: [{ itemId: 'absent', inputSide: 'west', outputSide: 'east' }],
    },
    {
      ...defaultBuildVariant,
      overrides: [
        { itemId: 'a', inputSide: 'west', outputSide: 'east' },
        { itemId: 'a', inputSide: 'east', outputSide: 'west' },
      ],
    },
    { ...defaultBuildVariant, inputSide: 'up' },
    { ...defaultBuildVariant, schemaVersion: 2 },
  ])
    expect(() => deriveBuildVariants(plan, variant)).toThrow();
  expect(() =>
    deriveBuildVariants({
      ...plan,
      nodes: [node('a', ['b']), node('b', ['a'])],
    }),
  ).toThrow(/cycl/i);
  expect(() =>
    deriveBuildVariants({ ...plan, nodes: [node('a', ['unknown'])] }),
  ).toThrow(/input/i);
  expect(() =>
    deriveBuildVariants({ ...plan, nodes: [node('a', []), node('a', [])] }),
  ).toThrow(/duplicate/i);
  expect(() => deriveBuildVariants({ ...plan, nodes: [] })).toThrow();
});
it('preflights excessive override arrays without reading any entry', () => {
  let reads = 0;
  const overrides = Array.from({ length: 65 }, () => ({
    itemId: 'a',
    inputSide: 'west',
    outputSide: 'east',
  }));
  Object.defineProperty(overrides, 0, {
    get() {
      reads++;
      return { itemId: 'a', inputSide: 'west', outputSide: 'east' };
    },
  });
  expect(() =>
    deriveBuildVariants(plan, { ...defaultBuildVariant, overrides }),
  ).toThrow();
  expect(reads).toBe(0);
});

it('rejects huge sparse arrays before densification and uses bounded indexed WebMCP entries', () => {
  const sparse = new Array(1_000_000_000);
  let reads = 0;
  Object.defineProperty(sparse, 0, {
    get() {
      reads++;
      throw new Error('must not read');
    },
  });
  expect(() =>
    deriveBuildVariants(plan, { ...defaultBuildVariant, overrides: sparse }),
  ).toThrow(/64-entry/);
  expect(reads).toBe(0);
  const overrides = [{ itemId: 'a', inputSide: 'west', outputSide: 'east' }];
  Object.defineProperty(overrides, Symbol.iterator, {
    value() {
      throw new Error('must not iterate input');
    },
  });
  expect(
    deriveBuildVariants(plan, { ...defaultBuildVariant, overrides }).floors[2],
  ).toMatchObject({ inputSide: 'west', outputSide: 'east' });
});
it('retains the legitimate 64-override schema boundary', async () => {
  const { variantSchema } = await import('../src/domain/build-variants.js');
  const overrides = Array.from({ length: 64 }, (_, i) => ({
    itemId: `stage-${i}`,
    inputSide: 'west',
    outputSide: 'east',
  }));
  expect(
    variantSchema.parse({ ...defaultBuildVariant, overrides }).overrides,
  ).toEqual(overrides);
});
it('aligns sibling branches with their producer and resolves conflicting parents deterministically', () => {
  const branching = {
    ...plan,
    nodes: [
      node('a', ['b', 'c']),
      node('b', ['d']),
      node('c', ['d']),
      node('d', ['ore']),
    ],
  };
  const result = deriveBuildVariants(branching);
  expect(
    result.floors.map((f) => [f.itemId, f.inputSide, f.outputSide]),
  ).toEqual([
    ['d', 'west', 'east'],
    ['b', 'east', 'west'],
    ['c', 'east', 'west'],
    ['a', 'west', 'east'],
  ]);
  expect(result.transfers.every((t) => t.sideChanges === 0)).toBe(true);
  const overridden = deriveBuildVariants(branching, {
    ...defaultBuildVariant,
    overrides: [{ itemId: 'b', inputSide: 'north', outputSide: 'east' }],
  });
  expect(overridden.floors.find((f) => f.itemId === 'a')!.inputSide).toBe(
    'west',
  );
  expect(
    overridden.transfers.find(
      (t) => t.fromItemId === 'b' && t.toItemId === 'a',
    )!.sideChanges,
  ).toBe(2);
  expect(
    deriveBuildVariants({
      ...branching,
      nodes: [...branching.nodes].reverse(),
    }),
  ).toEqual(result);
});
