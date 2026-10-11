import { expect, test } from 'vitest';
import { buildPlanDocument } from '../src/planning';
import fixture from '../fixtures/plan.synthetic.json';
import { syntheticCatalog } from '../src/domain/catalog';

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
