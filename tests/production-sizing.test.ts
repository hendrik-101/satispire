import { expect, it } from 'vitest';
import { syntheticCatalog } from '../src/domain/catalog.js';
import {
  scaleProductionByFactor,
  solveProduction,
} from '../src/domain/production.js';
import {
  productionSizingInputs,
  sizeProductionByInput,
} from '../src/domain/production-sizing.js';
import { Rational } from '../src/domain/rational.js';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../src/domain/vanilla.js';

const technology = { ...technologyAtTier(4), beltTier: 2 };
const steel = {
  targets: [
    { itemId: 'Desc_SteelPipe_C', rate: '20' },
    { itemId: 'Desc_SteelPlate_C', rate: '33/2' },
    { itemId: 'Desc_SteelPlateReinforced_C', rate: '12' },
  ],
  recipes: availableChoices(technology),
  imports: vanillaCatalog.items
    .filter((item) => item.raw)
    .map((item) => item.id),
  technology,
};

it('distinguishes factory consumption of 240 steel ingots from the beam stage input of 210', () => {
  const plan = solveProduction(vanillaCatalog, steel);
  expect(
    productionSizingInputs(plan, { scope: 'factory' }).find(
      (input) => input.itemId === 'Desc_SteelIngot_C',
    )!.rate,
  ).toBe('240');
  expect(
    productionSizingInputs(plan, {
      scope: 'stage',
      stageItemId: 'Desc_SteelPlate_C',
    }),
  ).toEqual([{ itemId: 'Desc_SteelIngot_C', rate: '210' }]);
  const factory = sizeProductionByInput(vanillaCatalog, steel, {
    scope: 'factory',
    itemId: 'Desc_SteelIngot_C',
    rate: '240',
  });
  expect(factory.input.targets).toEqual(steel.targets);
  const stage = sizeProductionByInput(vanillaCatalog, steel, {
    scope: 'stage',
    stageItemId: 'Desc_SteelPlate_C',
    itemId: 'Desc_SteelIngot_C',
    rate: '240',
  });
  expect(stage.input.targets).toEqual([
    { itemId: 'Desc_SteelPipe_C', rate: '160/7' },
    { itemId: 'Desc_SteelPlate_C', rate: '132/7' },
    { itemId: 'Desc_SteelPlateReinforced_C', rate: '96/7' },
  ]);
  expect(
    productionSizingInputs(stage.plan, {
      scope: 'stage',
      stageItemId: 'Desc_SteelPlate_C',
    })[0]!.rate,
  ).toBe('240');
  expect(
    productionSizingInputs(stage.plan, { scope: 'factory' }).find(
      (input) => input.itemId === 'Desc_SteelIngot_C',
    )!.rate,
  ).toBe('1920/7');
  expect(solveProduction(vanillaCatalog, stage.input)).toEqual(stage.plan);
});

it('sizes a whole factory from a raw resource and excludes direct deliveries from consumption', () => {
  const request = {
    ...steel,
    targets: [...steel.targets, { itemId: 'Desc_SteelIngot_C', rate: '60' }],
  };
  const plan = solveProduction(vanillaCatalog, request);
  expect(
    plan.nodes.find((node) => node.itemId === 'Desc_SteelIngot_C')!.rate,
  ).toBe('300');
  expect(
    productionSizingInputs(plan, { scope: 'factory' }).find(
      (input) => input.itemId === 'Desc_SteelIngot_C',
    )!.rate,
  ).toBe('240');
  const scaled = sizeProductionByInput(vanillaCatalog, request, {
    scope: 'factory',
    itemId: 'Desc_SteelIngot_C',
    rate: '480',
  });
  expect(
    scaled.plan.targets.find((target) => target.itemId === 'Desc_SteelIngot_C')!
      .rate,
  ).toBe('120');
  expect(
    scaled.plan.nodes.find((node) => node.itemId === 'Desc_SteelIngot_C')!.rate,
  ).toBe('600');
  const raw = sizeProductionByInput(vanillaCatalog, steel, {
    scope: 'factory',
    itemId: 'Desc_OreIron_C',
    rate: '480',
  });
  expect(raw.input.targets.map((target) => target.rate)).toEqual([
    '40',
    '33',
    '24',
  ]);
  expect(
    raw.plan.imports.find((item) => item.itemId === 'Desc_OreIron_C')!.rate,
  ).toBe('480');
});

const synthetic = {
  targets: [
    { itemId: 'example:rod', rate: '5' },
    { itemId: 'example:plate', rate: '20' },
    { itemId: 'example:rod', rate: '5' },
  ],
  recipes: {
    'example:rod': 'example:shape',
    'example:plate': 'example:press',
    'example:ingot': 'example:smelt',
  },
  imports: ['example:ore'],
};

it('supports arbitrary catalog items, exact fractional inputs, duplicate targets and stable first order', () => {
  const before = structuredClone(synthetic);
  expect(
    productionSizingInputs(solveProduction(syntheticCatalog, synthetic), {
      scope: 'factory',
    }).map((input) => input.itemId),
  ).toEqual(['example:ore', 'example:ingot']);
  const result = sizeProductionByInput(syntheticCatalog, synthetic, {
    scope: 'stage',
    stageItemId: 'example:plate',
    itemId: 'example:ingot',
    rate: '1/3',
  });
  expect(result.input.targets).toEqual([
    { itemId: 'example:rod', rate: '1/9' },
    { itemId: 'example:plate', rate: '2/9' },
  ]);
  expect(synthetic).toEqual(before);
  expect(solveProduction(syntheticCatalog, result.input)).toEqual(result.plan);
});

it('preserves computed rational factors beyond external input digit bounds', () => {
  const tiny = {
    ...synthetic,
    targets: [{ itemId: 'example:plate', rate: `1/${2n ** 195n}` }],
  };
  const result = sizeProductionByInput(syntheticCatalog, tiny, {
    scope: 'stage',
    stageItemId: 'example:plate',
    itemId: 'example:ingot',
    rate: '30',
  });
  expect(result.input.targets).toEqual([
    { itemId: 'example:plate', rate: '20' },
  ]);
  expect(() =>
    scaleProductionByFactor(syntheticCatalog, synthetic, Rational.parse('0')),
  ).toThrow(/positive/);
});

it.each(['0', '-1', '1/0', '', '7,5', '1.000,5'])(
  'rejects invalid input rates %s without changing targets',
  (rate) => {
    expect(() =>
      sizeProductionByInput(syntheticCatalog, synthetic, {
        scope: 'factory',
        itemId: 'example:ore',
        rate,
      }),
    ).toThrow();
    expect(synthetic.targets).toHaveLength(3);
  },
);

it('rejects unknown stage/input anchors and never treats a stage output as an input', () => {
  expect(
    productionSizingInputs(solveProduction(syntheticCatalog, synthetic), {
      scope: 'stage',
      stageItemId: 'missing',
    }),
  ).toEqual([]);
  expect(() =>
    sizeProductionByInput(syntheticCatalog, synthetic, {
      scope: 'stage',
      stageItemId: 'missing',
      itemId: 'example:ingot',
      rate: '30',
    }),
  ).toThrow(/Produktionsstufe/);
  expect(() =>
    sizeProductionByInput(syntheticCatalog, synthetic, {
      scope: 'stage',
      stageItemId: 'example:plate',
      itemId: 'example:ore',
      rate: '30',
    }),
  ).toThrow(/Input/);
  expect(() =>
    sizeProductionByInput(syntheticCatalog, synthetic, {
      scope: 'factory',
      itemId: 'example:plate',
      rate: '30',
    }),
  ).toThrow(/Input/);
});
