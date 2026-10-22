import { expect, test } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FloorView } from '../../web/workspace/FloorView.js';
import { defaultBuildVariant } from '../../src/domain/build-variants.js';
import { solveProduction } from '../../src/domain/production.js';
import type { Catalog } from '../../src/domain/catalog.js';
const raw = Array.from({ length: 64 }, (_, i) => ({
  id: `raw-${i}`,
  name: `Raw ${i}`,
  raw: true,
}));
const catalog: Catalog = {
  schemaVersion: 1,
  catalogVersion: 'synthetic-many-feeds',
  provenance: { kind: 'synthetic', source: 'authored-regression' },
  items: [...raw, { id: 'product', name: 'Product', raw: false }],
  machines: [{ id: 'machine', name: 'Machine' }],
  recipes: [
    {
      id: 'recipe',
      name: 'Recipe',
      machineId: 'machine',
      durationSeconds: '60',
      inputs: raw.map((i) => ({ itemId: i.id, quantity: '1' })),
      outputs: [{ itemId: 'product', quantity: '1' }],
    },
  ],
};
const technology = {
  availableMachines: ['machine'],
  unlockedRecipes: ['recipe'],
  beltTier: 1,
  pipeTier: 1,
};
const plan = solveProduction(catalog, {
  targets: [{ itemId: 'product', rate: '1' }],
  recipes: { product: 'recipe' },
  imports: raw.map((i) => i.id),
  technology,
});
for (const side of ['west', 'east', 'north', 'south'] as const)
  test(`fits all 64 ${side} feed manifolds and labels`, async ({ page }) => {
    const markup = renderToStaticMarkup(
      createElement(FloorView, {
        catalog,
        plan,
        technology,
        selected: 'product',
        zoom: 1,
        rows: 1,
        variant: {
          ...defaultBuildVariant,
          pattern: 'fixed',
          inputSide: side,
          outputSide: side,
        },
        changeVariant: () => {},
      }),
    );
    await page.setContent(
      `<style>.drawing{height:600px}svg.floor-scene{height:600px;width:100%}</style>${markup}`,
    );
    const scene = page.getByTestId('floor-scene');
    await expect(scene.locator('[data-feed]')).toHaveCount(64);
    const fitted = await scene.evaluate((svg) => {
      const box = svg.getBoundingClientRect();
      return Array.from(
        svg.querySelectorAll(
          '[data-feed], [data-aggregate], [data-output-attachment], [data-target-delivery]',
        ),
      ).every((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.left >= box.left - 1 &&
          r.right <= box.right + 1 &&
          r.top >= box.top - 1 &&
          r.bottom <= box.bottom + 1
        );
      });
    });
    expect(fitted).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`64-feeds-${side}.png`),
      fullPage: true,
    });
  });
