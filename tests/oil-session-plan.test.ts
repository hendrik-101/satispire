import { expect, it } from 'vitest';
import { validateSessionPlan } from '../src/session-plan.js';
import { planFileSchema } from '../src/plan-file.js';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../src/domain/vanilla.js';
import { solveProduction, scaleProduction } from '../src/domain/production.js';
import { generateSupplyLayout } from '../src/domain/supply-layout.js';

it('round-trips and validates a shared tier-five oil factory with every output conserved', () => {
  const technology = technologyAtTier(5);
  const file = planFileSchema.parse({
    schemaVersion: 1,
    catalogVersion: vanillaCatalog.catalogVersion,
    production: {
      targets: [
        { itemId: 'Desc_Rubber_C', rate: '20' },
        { itemId: 'Desc_Plastic_C', rate: '20' },
        { itemId: 'Desc_LiquidFuel_C', rate: '40' },
      ],
      recipes: availableChoices(technology),
      imports: ['Desc_LiquidOil_C'],
      technology,
    },
  });
  const restored = JSON.parse(JSON.stringify(file));
  expect(validateSessionPlan(restored)).toEqual(file);
  const plan = solveProduction(vanillaCatalog, restored.production);
  expect(plan.imports).toEqual([{ itemId: 'Desc_LiquidOil_C', rate: '120' }]);
  expect(plan.nodes).toHaveLength(3);
  expect(plan.surplus).toEqual([
    { itemId: 'Desc_HeavyOilResidue_C', rate: '30' },
    { itemId: 'Desc_PolymerResin_C', rate: '30' },
  ]);
  const layout = generateSupplyLayout(vanillaCatalog, plan, technology, 0);
  expect(layout.floors).toHaveLength(3);
  expect(
    layout.floors.reduce((count, floor) => count + floor.machineCount, 0),
  ).toBe(3);
  const scaled = scaleProduction(vanillaCatalog, restored.production, {
    itemId: 'Desc_LiquidOil_C',
    rate: '240',
  });
  expect(scaled.imports).toEqual([{ itemId: 'Desc_LiquidOil_C', rate: '240' }]);
  expect(scaled.surplus).toEqual([
    { itemId: 'Desc_HeavyOilResidue_C', rate: '60' },
    { itemId: 'Desc_PolymerResin_C', rate: '60' },
  ]);
});

it('reuses rubber residue in residual fuel without a second raw-oil producer', () => {
  const technology = technologyAtTier(5, ['Recipe_ResidualFuel_C']);
  const file = planFileSchema.parse({
    schemaVersion: 1,
    catalogVersion: vanillaCatalog.catalogVersion,
    production: {
      targets: [
        { itemId: 'Desc_Rubber_C', rate: '20' },
        { itemId: 'Desc_LiquidFuel_C', rate: '10' },
      ],
      recipes: {
        Desc_Rubber_C: 'Recipe_Rubber_C',
        Desc_HeavyOilResidue_C: 'Recipe_Rubber_C',
        Desc_LiquidFuel_C: 'Recipe_ResidualFuel_C',
      },
      imports: ['Desc_LiquidOil_C'],
      technology,
    },
  });
  expect(validateSessionPlan(file)).toEqual(file);
  const plan = solveProduction(vanillaCatalog, file.production);
  expect(plan.imports).toEqual([{ itemId: 'Desc_LiquidOil_C', rate: '30' }]);
  expect(plan.nodes).toHaveLength(2);
  expect(plan.surplus).toEqual([
    { itemId: 'Desc_HeavyOilResidue_C', rate: '5' },
  ]);
  const layout = generateSupplyLayout(vanillaCatalog, plan, technology, 0);
  expect(layout.transfers).toHaveLength(1);
  expect(layout.transfers[0]).toMatchObject({
    fromItemId: 'Desc_Rubber_C',
    toItemId: 'Desc_LiquidFuel_C',
    itemId: 'Desc_HeavyOilResidue_C',
    rate: '15',
  });
});
