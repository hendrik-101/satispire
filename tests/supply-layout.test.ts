import { expect, it } from 'vitest';
import { generateSupplyLayout } from '../src/domain/supply-layout.js';
import {
  vanillaCatalog,
  technologyAtTier,
  availableChoices,
} from '../src/domain/vanilla.js';
import { solveProduction } from '../src/domain/production.js';
const technology = technologyAtTier(4);
const input = {
  targets: [{ itemId: 'Desc_IronPlate_C', rate: '320' }],
  recipes: availableChoices(technology),
  imports: ['Desc_OreIron_C'],
  technology,
};
it('generates automatic and manual row variants with identical floor area', () => {
  const plan = solveProduction(vanillaCatalog, input);
  const layout = generateSupplyLayout(vanillaCatalog, plan, technology, 0);
  expect(layout.floors).toHaveLength(2);
  expect(
    layout.floors.every(
      (f) => JSON.stringify(f.footprint) === JSON.stringify(layout.footprint),
    ),
  ).toBe(true);
  const manual = generateSupplyLayout(vanillaCatalog, plan, technology, 3);
  expect(
    manual.floors.find((f) => f.itemId === 'Desc_IronPlate_C')!.rowCounts,
  ).toEqual([6, 5, 5]);
  expect(manual.floors[0]!.physicalFootprint).toBeNull();
  expect(manual.floors[0]!.physicalPorts).toBeNull();
});
it('sizes supply lanes for current belts and orients logical output towards lifts', () => {
  const plan = solveProduction(vanillaCatalog, input);
  const low = generateSupplyLayout(
    vanillaCatalog,
    plan,
    { ...technology, beltTier: 1 },
    0,
  );
  const high = generateSupplyLayout(vanillaCatalog, plan, technology, 0);
  expect(
    low.floors.find((f) => f.itemId === 'Desc_IronPlate_C')!.inputs[0]!.lines,
  ).toBe(8);
  expect(
    high.floors.find((f) => f.itemId === 'Desc_IronPlate_C')!.inputs[0]!.lines,
  ).toBe(2);
  expect(
    low.floors.every(
      (f) =>
        f.connections.output.side === 'east' &&
        f.connections.input.side === 'east',
    ),
  ).toBe(true);
});
it('rejects excessive layouts and invalid row settings rather than truncating machines', () => {
  const plan = solveProduction(vanillaCatalog, {
    ...input,
    targets: [{ itemId: 'Desc_IronPlate_C', rate: '100000' }],
  });
  expect(() =>
    generateSupplyLayout(vanillaCatalog, plan, technology, 0),
  ).toThrow(/capacity|Kapazität/i);
  expect(() =>
    generateSupplyLayout(
      vanillaCatalog,
      solveProduction(vanillaCatalog, input),
      technology,
      NaN,
    ),
  ).toThrow();
});
it('rejects raw-only plans before replacing the last valid workspace', () => {
  const plan = solveProduction(vanillaCatalog, {
    targets: [{ itemId: 'Desc_OreIron_C', rate: '30' }],
    recipes: {},
    imports: ['Desc_OreIron_C'],
    technology,
  });
  expect(() =>
    generateSupplyLayout(vanillaCatalog, plan, technology, 0),
  ).toThrow(/manufactured|Produktionsstufe/i);
});
