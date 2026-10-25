import { expect, test } from 'vitest';
import { solveProduction } from '../src/domain/production.js';
import { generateSupplyLayout } from '../src/domain/supply-layout.js';
import { defaultBuildVariant } from '../src/domain/build-variants.js';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../src/domain/vanilla.js';
import {
  supplySceneBounds,
  supplySceneMetrics,
} from '../web/workspace/supply-scene.js';

const technology = { ...technologyAtTier(4), beltTier: 2 };
const plan = solveProduction(vanillaCatalog, {
  targets: [
    { itemId: 'Desc_SteelPipe_C', rate: '20' },
    { itemId: 'Desc_SteelPlateReinforced_C', rate: '12' },
  ],
  recipes: availableChoices(technology),
  imports: vanillaCatalog.items
    .filter((item) => item.raw)
    .map((item) => item.id),
  technology,
});

test.each([
  ['west', 'east'],
  ['north', 'south'],
  ['south', 'north'],
  ['west', 'west'],
  ['south', 'south'],
] as const)(
  'cheap shared bounds contain detailed scenes for %s → %s',
  (inputSide, outputSide) => {
    const layout = generateSupplyLayout(vanillaCatalog, plan, technology, 2, {
      ...defaultBuildVariant,
      pattern: 'fixed',
      inputSide,
      outputSide,
    });
    for (const compact of [false, true]) {
      for (const floor of layout.floors) {
        const bounds = supplySceneBounds(
          layout,
          floor,
          vanillaCatalog,
          technology,
          compact,
        );
        const actual = supplySceneMetrics(
          layout,
          floor,
          vanillaCatalog,
          technology,
          compact,
        );
        expect(bounds.sceneLeft).toBeLessThanOrEqual(actual.sceneLeft);
        expect(bounds.sceneTop).toBeLessThanOrEqual(actual.sceneTop);
        expect(bounds.sceneLeft + bounds.sceneWidth).toBeGreaterThanOrEqual(
          actual.sceneLeft + actual.sceneWidth,
        );
        expect(bounds.sceneTop + bounds.sceneHeight).toBeGreaterThanOrEqual(
          actual.sceneTop + actual.sceneHeight,
        );
      }
    }
  },
);
