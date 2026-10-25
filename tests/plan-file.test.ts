import { expect, it } from 'vitest';
import { planFileSchema } from '../src/plan-file.js';
import { defaultBuildVariant } from '../src/domain/build-variants.js';
const file = {
  schemaVersion: 1,
  catalogVersion: 'test',
  production: {
    targets: [{ itemId: 'example:plate', rate: '20' }],
    recipes: { 'example:plate': 'example:press' },
    imports: ['example:ore'],
  },
};
it('defaults legacy files and preserves rows and side contracts in JSON round trips', () => {
  expect(planFileSchema.parse(file).layout).toEqual({
    rows: 0,
    variant: defaultBuildVariant,
  });
  const current = {
    ...file,
    layout: {
      rows: 3,
      variant: {
        ...defaultBuildVariant,
        inputSide: 'north',
        outputSide: 'north',
      },
    },
  };
  expect(planFileSchema.parse(JSON.parse(JSON.stringify(current)))).toEqual(
    current,
  );
});
it('rejects invalid layout fields rather than silently losing factory intent', () => {
  for (const layout of [
    { rows: 65, variant: defaultBuildVariant },
    { rows: 0, variant: { ...defaultBuildVariant, pattern: 'spin' } },
    { rows: 1, unknown: 1 },
    {
      rows: 0,
      variant: {
        ...defaultBuildVariant,
        overrides: Array(65).fill({
          itemId: 'a',
          inputSide: 'west',
          outputSide: 'east',
        }),
      },
    },
  ])
    expect(() => planFileSchema.parse({ ...file, layout })).toThrow();
});

it('round-trips every target and selected recipe without collapsing shared dependencies', () => {
  const production = {
    targets: [
      { itemId: 'example:plate', rate: '20' },
      { itemId: 'example:rod', rate: '33/2' },
      { itemId: 'example:screw', rate: '12' },
    ],
    recipes: {
      'example:plate': 'example:alternate-plate',
      'example:rod': 'example:rod-recipe',
      'example:screw': 'example:cast-screw',
      'example:ingot': 'example:pure-ingot',
    },
    imports: ['example:ore'],
  };
  const restored = planFileSchema.parse(
    JSON.parse(JSON.stringify({ ...file, production })),
  );
  expect(restored.production).toEqual(production);
});
