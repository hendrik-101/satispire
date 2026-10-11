import { expect, test } from 'vitest';
import { syntheticCatalog } from '../src/domain/catalog.js';
import { solveProduction } from '../src/domain/production.js';
import { graphConnections, initialProduction } from '../web/workspace/model.js';

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
