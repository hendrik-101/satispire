import { expect, it } from 'vitest';
import {
  allocateProductionFlows,
  productionOutputs,
} from '../src/domain/production-flows.js';
import { coproductPlan } from './coproduct-fixture.js';

it('allocates a coproduct to internal demand, target and exact surplus', () => {
  expect(allocateProductionFlows(coproductPlan)).toEqual({
    transfers: [{ fromItemId: 'a', toItemId: 'c', itemId: 'b', rate: '100' }],
    targets: [
      { fromItemId: 'a', itemId: 'a', rate: '80' },
      { fromItemId: 'a', itemId: 'b', rate: '10' },
      { fromItemId: 'c', itemId: 'c', rate: '20' },
    ],
    surplus: [{ fromItemId: 'a', itemId: 'b', rate: '10' }],
    imports: [{ toItemId: 'a', itemId: 'raw', rate: '20' }],
  });
  expect(productionOutputs(coproductPlan.nodes[1]!)).toEqual([
    { itemId: 'c', rate: '20' },
  ]);
});

it('splits demand over multiple producers without duplicating targets or machine production', () => {
  const first = coproductPlan.nodes[0]!;
  const plan = {
    ...coproductPlan,
    imports: [{ itemId: 'raw', rate: '40' }],
    nodes: [
      ...coproductPlan.nodes,
      {
        ...first,
        itemId: 'd',
        rate: '40',
        outputs: [
          { itemId: 'b', rate: '40' },
          { itemId: 'd', rate: '40' },
        ],
      },
    ],
    targets: [...coproductPlan.targets, { itemId: 'd', rate: '40' }],
    surplus: [{ itemId: 'b', rate: '50' }],
  };
  const flow = allocateProductionFlows(plan);
  expect(flow.transfers).toEqual([
    { fromItemId: 'a', toItemId: 'c', itemId: 'b', rate: '100' },
  ]);
  expect(flow.targets.filter((f) => f.itemId === 'b')).toEqual([
    { fromItemId: 'a', itemId: 'b', rate: '10' },
  ]);
  expect(flow.surplus).toEqual([
    { fromItemId: 'a', itemId: 'b', rate: '10' },
    { fromItemId: 'd', itemId: 'b', rate: '40' },
  ]);
  expect(
    allocateProductionFlows({
      ...plan,
      nodes: [...plan.nodes].reverse(),
      targets: [...plan.targets].reverse(),
    }),
  ).toEqual(flow);
});

it('rejects missing material and inconsistent surplus instead of inventing production', () => {
  expect(() =>
    allocateProductionFlows({
      ...coproductPlan,
      targets: [{ itemId: 'b', rate: '121' }],
    }),
  ).toThrow(/demand|production/i);
  expect(() =>
    allocateProductionFlows({ ...coproductPlan, surplus: [] }),
  ).toThrow(/surplus/i);
});

it('allocates net raw imports and produced recycled material to the same consumer', () => {
  const plan = {
    ...coproductPlan,
    imports: [{ itemId: 'raw', rate: '10' }],
    nodes: coproductPlan.nodes.map((node) =>
      node.itemId === 'c'
        ? {
            ...node,
            outputs: [
              { itemId: 'c', rate: '20' },
              { itemId: 'raw', rate: '10' },
            ],
          }
        : node,
    ),
  };
  const flow = allocateProductionFlows(plan);
  expect(flow.imports).toEqual([{ toItemId: 'a', itemId: 'raw', rate: '10' }]);
  expect(flow.transfers).toContainEqual({
    fromItemId: 'c',
    toItemId: 'a',
    itemId: 'raw',
    rate: '10',
  });
});

it('uses a rooted supplier before a cyclic coproduct source when both can satisfy demand', () => {
  const stage = (
    itemId: string,
    inputs: { itemId: string; rate: string }[],
    outputs: { itemId: string; rate: string }[],
  ) => ({
    itemId,
    inputs,
    outputs,
    rate: '1',
    recipeId: `make-${itemId}`,
    machineId: 'machine',
    craftsPerMinute: '1',
    machineCount: 1,
    utilization: '1',
  });
  const plan = {
    schemaVersion: 1 as const,
    catalogVersion: 'rooted-allocation',
    targets: ['a', 'd', 'e'].map((itemId) => ({ itemId, rate: '1' })),
    imports: [{ itemId: 'ore', rate: '1' }],
    surplus: [{ itemId: 'b', rate: '1' }],
    nodes: [
      stage(
        'a',
        [{ itemId: 'b', rate: '1' }],
        [
          { itemId: 'a', rate: '1' },
          { itemId: 'c', rate: '1' },
        ],
      ),
      stage(
        'd',
        [{ itemId: 'c', rate: '1' }],
        [
          { itemId: 'b', rate: '1' },
          { itemId: 'd', rate: '1' },
        ],
      ),
      stage(
        'e',
        [{ itemId: 'ore', rate: '1' }],
        [
          { itemId: 'b', rate: '1' },
          { itemId: 'e', rate: '1' },
        ],
      ),
    ],
  };
  const flow = allocateProductionFlows(plan);
  expect(flow.transfers).toEqual([
    { fromItemId: 'e', toItemId: 'a', itemId: 'b', rate: '1' },
    { fromItemId: 'a', toItemId: 'd', itemId: 'c', rate: '1' },
  ]);
  expect(
    allocateProductionFlows({ ...plan, nodes: [...plan.nodes].reverse() }),
  ).toEqual(flow);
});

it('reconsiders a ready sink that consumes material needed to activate a coproduct supplier', () => {
  const stage = (itemId: string, inputId: string, outputs: string[]) => ({
    itemId,
    inputs: [{ itemId: inputId, rate: '1' }],
    outputs: outputs.map((itemId) => ({ itemId, rate: '1' })),
    rate: '1',
    recipeId: `make-${itemId}`,
    machineId: 'machine',
    craftsPerMinute: '1',
    machineCount: 1,
    utilization: '1',
  });
  const plan = {
    schemaVersion: 1 as const,
    catalogVersion: 'allocation-backtracking',
    imports: [{ itemId: 'ore', rate: '1' }],
    targets: ['a', 'd', 'e', 'z'].map((itemId) => ({ itemId, rate: '1' })),
    nodes: [
      stage('a', 'b', ['a']),
      stage('d', 'b', ['d', 'c']),
      stage('e', 'c', ['e', 'b']),
      stage('z', 'ore', ['z', 'b']),
    ],
  };
  const flow = allocateProductionFlows(plan);
  expect(flow.transfers).toEqual([
    { fromItemId: 'z', toItemId: 'd', itemId: 'b', rate: '1' },
    { fromItemId: 'd', toItemId: 'e', itemId: 'c', rate: '1' },
    { fromItemId: 'e', toItemId: 'a', itemId: 'b', rate: '1' },
  ]);
  expect(
    allocateProductionFlows({ ...plan, nodes: [...plan.nodes].reverse() }),
  ).toEqual(flow);
});

it('accepts fully recycled raw input with no external import row when raw identity is supplied', () => {
  const plan = {
    ...coproductPlan,
    imports: [],
    nodes: coproductPlan.nodes.map((node) =>
      node.itemId === 'c'
        ? {
            ...node,
            outputs: [
              { itemId: 'c', rate: '20' },
              { itemId: 'raw', rate: '20' },
            ],
          }
        : node,
    ),
  };
  expect(allocateProductionFlows(plan, ['raw']).transfers).toContainEqual({
    fromItemId: 'c',
    toItemId: 'a',
    itemId: 'raw',
    rate: '20',
  });
});

it('rejects excessive allocation search work with an explicit bounded diagnostic', () => {
  const nodes = Array.from({ length: 800 }, (_, index) => ({
    itemId: `item-${index}`,
    recipeId: `recipe-${index}`,
    machineId: 'machine',
    rate: '1',
    craftsPerMinute: '1',
    machineCount: 1,
    utilization: '1',
    inputs: [{ itemId: 'raw', rate: '1' }],
  }));
  const plan = {
    schemaVersion: 1 as const,
    catalogVersion: 'allocation-work-bound',
    nodes,
    imports: [{ itemId: 'raw', rate: '800' }],
    targets: nodes.map((node) => ({ itemId: node.itemId, rate: '1' })),
  };
  expect(() => allocateProductionFlows(plan)).toThrow(/250000-unit work bound/);
});

it('rejects an unrooted manufactured loop before searching unrelated ready stages', () => {
  const stage = (itemId: string, inputId: string, outputRate = '1') => ({
    itemId,
    inputs: [{ itemId: inputId, rate: '1' }],
    outputs: [{ itemId, rate: outputRate }],
    rate: outputRate,
    recipeId: `make-${itemId}`,
    machineId: 'machine',
    craftsPerMinute: '1',
    machineCount: 1,
    utilization: '1',
  });
  const nodes = [
    stage('a', 'b', '2'),
    stage('b', 'a', '2'),
    ...Array.from({ length: 18 }, (_, index) =>
      stage(`independent-${index}`, 'raw'),
    ),
  ];
  const plan = {
    schemaVersion: 1 as const,
    catalogVersion: 'unrooted-loop',
    nodes,
    imports: [{ itemId: 'raw', rate: '18' }],
    targets: nodes.map((node) => ({ itemId: node.itemId, rate: '1' })),
  };
  expect(() => allocateProductionFlows(plan)).toThrow(/flow cycle/i);
});
