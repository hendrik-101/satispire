import { expect, test } from '@playwright/test';
import { Rational } from '../../src/domain/rational.js';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../../src/domain/vanilla.js';

test('two incoming steel belts each feed a real splitter and every machine joins the output mergers', async ({
  page,
}) => {
  await page.goto(process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173');
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  const technology = { ...technologyAtTier(4), beltTier: 2 };
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'steel-belts.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: vanillaCatalog.catalogVersion,
        production: {
          targets: [
            { itemId: 'Desc_SteelPipe_C', rate: '20' },
            { itemId: 'Desc_SteelPlate_C', rate: '33/2' },
            { itemId: 'Desc_SteelPlateReinforced_C', rate: '12' },
          ],
          recipes: availableChoices(technology),
          imports: vanillaCatalog.items.filter((i) => i.raw).map((i) => i.id),
          technology,
        },
      }),
    ),
  });
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_SteelPlate_C');
  const scene = page.getByTestId('floor-scene');
  await expect(scene.locator('[data-kind="inlet"]')).toHaveCount(2);
  await expect(
    scene.locator(
      '.transport-junction[data-kind="splitter"][data-resource-id="Desc_SteelIngot_C"]',
    ),
  ).toHaveCount(2);
  await expect(
    scene.locator('.transport-junction[data-kind="merger"]'),
  ).toHaveCount(3);
  await expect(scene.locator('[data-kind="outlet"]')).toHaveCount(2);
  await expect(scene.locator('.supply-belt[data-machine-input]')).toHaveCount(
    4,
  );
  await expect(scene.locator('.supply-belt[data-machine-output]')).toHaveCount(
    4,
  );
  const inletBelts = await scene.evaluate((svg) =>
    [...svg.querySelectorAll('[data-kind="inlet"]')].map((inlet) => {
      const id = inlet.getAttribute('data-transport-node');
      const belts = [...svg.querySelectorAll('.supply-belt')].filter(
        (belt) => belt.getAttribute('data-edge-from') === id,
      );
      return belts.map((belt) => ({
        rate: belt.getAttribute('data-rate'),
        color: belt.querySelector('.supply-belt-edge')!.getAttribute('stroke'),
        to: svg
          .querySelector(
            `[data-transport-node="${belt.getAttribute('data-edge-to')}"]`,
          )
          ?.getAttribute('data-kind'),
      }));
    }),
  );
  expect(inletBelts).toHaveLength(2);
  for (const belt of inletBelts) {
    expect(belt).toHaveLength(1);
    expect(belt[0]).toMatchObject({ rate: '105', to: 'splitter' });
  }
  expect(inletBelts[0]![0]!.color).toBe(inletBelts[1]![0]!.color);
  await expect(scene.locator('[data-target-delivery]')).toHaveText(
    '→ Ziel · 16,5 Stk./min',
  );
  await expect(page.locator('.canvas-summary')).toContainText('87,5 % Takt');
  await expect(scene.locator('.transport-junction text')).toHaveCount(0);
  await expect(scene.locator('[data-load-belt]')).toHaveCount(15);
  await expect(scene.locator('[data-overloaded="true"]')).toHaveCount(0);
  await expect(scene.locator('[data-aggregate="output"]')).toContainText(
    'AUS gesamt · 52,5 Stk./min',
  );
  const loads = await scene.locator('[data-load-belt]').allTextContents();
  expect(loads.filter((text) => text === '13,125/min')).toHaveLength(4);
  for (const text of [
    '26,25/min',
    '39,375/min',
    '52,5/min',
    '36/min',
    '16,5/min',
  ])
    expect(loads).toContain(text);
  const rates = await scene.locator('.supply-belt').evaluateAll((belts) =>
    belts.map((belt) => ({
      rate: belt.getAttribute('data-rate')!,
      capacity: belt.getAttribute('data-capacity')!,
    })),
  );
  expect(
    rates.every(
      ({ rate, capacity }) =>
        Rational.parseCanonical(rate).compare(
          Rational.parseCanonical(capacity),
        ) <= 0,
    ),
  ).toBe(true);
});
