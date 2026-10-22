import { expect, test } from 'vitest';
import { vanillaCatalog } from '../src/domain/vanilla.js';
import {
  resourceColor,
  resourcePalette,
} from '../web/workspace/resource-colors.js';

test('every recipe distinguishes its resources using the fixed palette', () => {
  for (const recipe of vanillaCatalog.recipes) {
    const resources = [
      ...new Set([...recipe.inputs, ...recipe.outputs].map((i) => i.itemId)),
    ];
    const colors = resources.map(resourceColor);
    expect(new Set(colors).size, recipe.id).toBe(resources.length);
    for (const color of colors) expect(resourcePalette).toContain(color);
  }
});

test('resource identity determines color independently of order, direction and unknown catalog items', () => {
  const ids = ['Desc_IronPlate_C', 'Desc_IronScrew_C', 'custom-feed'];
  const colors = ids.map(resourceColor);
  expect([...ids].reverse().map(resourceColor)).toEqual([...colors].reverse());
  expect(resourcePalette).toContain(resourceColor('custom-feed'));
});
