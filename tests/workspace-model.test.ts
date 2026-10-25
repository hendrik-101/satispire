import { expect, test } from 'vitest';
import { syntheticCatalog } from '../src/domain/catalog.js';
import { solveProduction } from '../src/domain/production.js';
import {
  calculateProduction,
  graphConnections,
  initialProduction,
} from '../web/workspace/model.js';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../src/domain/vanilla.js';

const technology = technologyAtTier(2);
const modularFrames = {
  targets: [{ itemId: 'Desc_ModularFrame_C', rate: '2' }],
  recipes: availableChoices(technology),
  imports: ['Desc_OreIron_C'],
  technology,
};

test.each(['7,5', '7.5', '15/2'])(
  'calculates exact modular frames from %s',
  (rate) => {
    const result = calculateProduction(vanillaCatalog, modularFrames, {
      itemId: 'Desc_ModularFrame_C',
      rate,
    });
    expect(result.input.targets).toEqual([
      { itemId: 'Desc_ModularFrame_C', rate: '15/2' },
    ]);
    expect(result.plan.imports).toEqual([
      { itemId: 'Desc_OreIron_C', rate: '180' },
    ]);
  },
);

test('sizes modular frames from 180 ore/min and supports fractional inputs', () => {
  for (const [rate, output] of [
    ['180', '15/2'],
    ['7,5', '5/16'],
    ['1/3', '1/72'],
  ] as const) {
    const result = calculateProduction(
      vanillaCatalog,
      modularFrames,
      modularFrames.targets[0]!,
      { itemId: 'Desc_OreIron_C', rate },
    );
    expect(result.plan.targets).toEqual([
      { itemId: 'Desc_ModularFrame_C', rate: output },
    ]);
    expect(solveProduction(vanillaCatalog, result.input)).toEqual(result.plan);
  }
  expect(modularFrames.targets[0]!.rate).toBe('2');
});

test('scales multiple targets proportionally and preserves the primary target', () => {
  const input = {
    targets: [
      { itemId: 'example:rod', rate: '15' },
      { itemId: 'example:plate', rate: '20' },
    ],
    recipes: initialProduction(syntheticCatalog, {}).recipes,
    imports: ['example:ore'],
  };
  const result = calculateProduction(
    syntheticCatalog,
    input,
    input.targets[0]!,
    {
      itemId: 'example:ore',
      rate: '180',
    },
  );
  expect(result.input.targets).toEqual([
    { itemId: 'example:rod', rate: '60' },
    { itemId: 'example:plate', rate: '80' },
  ]);
});

test.each(['0', '-1', '7,5,2', '1/0', '1.000,5', ''])(
  'rejects invalid sizing input %s',
  (rate) => {
    expect(() =>
      calculateProduction(
        vanillaCatalog,
        modularFrames,
        modularFrames.targets[0]!,
        { itemId: 'Desc_OreIron_C', rate },
      ),
    ).toThrow();
    expect(modularFrames.targets[0]!.rate).toBe('2');
  },
);

test('rejects an anchor outside the external inputs of the current chain', () => {
  for (const itemId of ['Desc_OreCopper_C', 'Desc_ModularFrame_C']) {
    expect(() =>
      calculateProduction(
        vanillaCatalog,
        modularFrames,
        modularFrames.targets[0]!,
        { itemId, rate: '180' },
      ),
    ).toThrow(/Eingang/);
  }
});

test('sizes imported duplicate targets once, keeping the selected primary first', () => {
  const input = {
    ...modularFrames,
    targets: [
      ...modularFrames.targets,
      { itemId: 'Desc_IronRod_C', rate: '6' },
      { itemId: 'Desc_IronRod_C', rate: '6' },
    ],
  };
  const result = calculateProduction(vanillaCatalog, input, input.targets[0]!, {
    itemId: 'Desc_OreIron_C',
    rate: '120',
  });
  expect(result.input.targets).toEqual([
    { itemId: 'Desc_ModularFrame_C', rate: '4' },
    { itemId: 'Desc_IronRod_C', rate: '24' },
  ]);
  expect(solveProduction(vanillaCatalog, result.input)).toEqual(result.plan);
});

test('preserves duplicate primary target demand when sizing an imported plan', () => {
  const input = {
    ...modularFrames,
    targets: [
      ...modularFrames.targets,
      ...modularFrames.targets,
      { itemId: 'Desc_IronRod_C', rate: '12' },
    ],
  };
  const result = calculateProduction(vanillaCatalog, input, input.targets[0]!, {
    itemId: 'Desc_OreIron_C',
    rate: '120',
  });
  expect(result.input.targets).toEqual([
    { itemId: 'Desc_ModularFrame_C', rate: '40/9' },
    { itemId: 'Desc_IronRod_C', rate: '40/3' },
  ]);
  expect(solveProduction(vanillaCatalog, result.input)).toEqual(result.plan);
  expect(input.targets).toHaveLength(3);
});

test('draws actual branches instead of connecting unrelated production stages', () => {
  const plan = solveProduction(syntheticCatalog, {
    targets: [
      { itemId: 'example:plate', rate: '20' },
      { itemId: 'example:rod', rate: '15' },
    ],
    recipes: {
      'example:ingot': 'example:smelt',
      'example:plate': 'example:press',
      'example:rod': 'example:shape',
    },
    imports: ['example:ore'],
  });
  expect(graphConnections(plan)).toEqual([
    { from: 'example:ore', to: 'example:ingot', rate: '45' },
    { from: 'example:ingot', to: 'example:plate', rate: '30' },
    { from: 'example:ingot', to: 'example:rod', rate: '15' },
  ]);
});

test('chooses an available initial target when the preferred recipe was excluded', () => {
  const catalog = {
    ...syntheticCatalog,
    recipes: syntheticCatalog.recipes.filter(
      (recipe) => recipe.id !== 'example:press',
    ),
  };
  const input = initialProduction(catalog, {});
  expect(input.targets).toEqual([{ itemId: 'example:ingot', rate: '20' }]);
  expect(solveProduction(catalog, input).nodes).toHaveLength(1);
});

test('calculates the steel outputs together with decimal rates and shared demand', () => {
  const technology = technologyAtTier(4);
  const targets = [
    { itemId: 'Desc_SteelPipe_C', rate: '20' },
    { itemId: 'Desc_SteelPlate_C', rate: '16,5' },
    { itemId: 'Desc_SteelPlateReinforced_C', rate: '12' },
  ];
  const input = {
    targets: modularFrames.targets,
    technology,
    recipes: availableChoices(technology),
    imports: vanillaCatalog.items.filter((i) => i.raw).map((i) => i.id),
  };
  const result = calculateProduction(vanillaCatalog, input, targets);
  expect(result.input.targets).toEqual([
    targets[0],
    { ...targets[1], rate: '33/2' },
    targets[2],
  ]);
  expect(
    result.plan.nodes.find((n) => n.itemId === 'Desc_SteelPlate_C')?.rate,
  ).toBe('105/2');
  expect(
    result.plan.nodes.filter((n) => n.itemId === 'Desc_SteelIngot_C'),
  ).toHaveLength(1);
  const scaled = calculateProduction(
    vanillaCatalog,
    result.input,
    result.input.targets,
    {
      itemId: result.plan.imports[0]!.itemId,
      rate: String(Number(result.plan.imports[0]!.rate) * 2),
    },
  );
  expect(scaled.input.targets.map((t) => t.rate)).toEqual(['40', '33', '24']);
  expect(input.targets).toEqual(modularFrames.targets);
});
