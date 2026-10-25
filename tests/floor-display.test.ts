import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import * as beltScene from '../web/workspace/belt-scene.js';
import { FloorView } from '../web/workspace/FloorView.js';
import { solveProduction } from '../src/domain/production.js';
import { defaultBuildVariant } from '../src/domain/build-variants.js';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../src/domain/vanilla.js';

const technology = technologyAtTier(4);
const plan = solveProduction(vanillaCatalog, {
  targets: [{ itemId: 'Desc_IronPlate_C', rate: '80' }],
  recipes: availableChoices(technology),
  imports: vanillaCatalog.items
    .filter((item) => item.raw)
    .map((item) => item.id),
  technology,
});
const render = (selected: string) =>
  renderToStaticMarkup(
    createElement(FloorView, {
      catalog: vanillaCatalog,
      plan,
      technology,
      selected,
      zoom: 1,
      rows: 2,
      variant: defaultBuildVariant,
      changeVariant: () => {},
    }),
  );

test('switching floors preserves the world viewport at the same zoom', () => {
  const views = plan.nodes.map(
    (node) =>
      render(node.itemId).match(
        /data-output-side="[^"]+" viewBox="([^"]+)"/,
      )![1],
  );
  expect(new Set(views).size).toBe(1);
});

test('machine keyboard descriptions identify its product and actual per-machine flow', () => {
  const markup = render('Desc_IronPlate_C');
  expect(markup).toContain('aria-describedby=');
  expect(markup).toContain('AUS:');
  expect(markup).toContain('EIN:');
  expect(markup).toContain('20 Stk./min');
  expect(markup).toContain('data-canvas-zoom="100"');
});

// Routing is the expensive boundary; bounds must not request routes for hidden floors.
test('only the selected floor requests detailed belt routing', () => {
  const routing = vi.spyOn(beltScene, 'placeBeltNetwork');
  try {
    render('Desc_IronPlate_C');
    expect(new Set(routing.mock.calls.map(([floor]) => floor.itemId))).toEqual(
      new Set(['Desc_IronPlate_C']),
    );
  } finally {
    routing.mockRestore();
  }
});
