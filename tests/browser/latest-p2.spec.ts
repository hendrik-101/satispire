import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { technologyAtTier, vanillaCatalog } from '../../src/domain/vanilla.js';
const url = process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173';
async function ready(page: import('@playwright/test').Page) {
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
}
test('shows all required transport lines at 320 Iron Plates/min on Tier 2', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Zielrate pro Minute').fill('320');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  const scene = page.getByTestId('floor-scene');
  await expect(scene.locator('[data-feed="1"]')).toContainText('4×');
  await expect(scene.locator('[data-aggregate="output"]')).toContainText('3×');
  await page.screenshot({
    path: test.info().outputPath('transport-counts.png'),
    fullPage: true,
  });
});
test('selects the new primary manufactured target and keeps inspector synchronized', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Produktionsziel').selectOption('Desc_IronRod_C');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByLabel('Stufe auswählen', { exact: true })).toHaveValue(
    'Desc_IronRod_C',
  );
  await expect(page.getByTestId('floor-scene')).toHaveAttribute(
    'aria-label',
    'Blockschema Iron Rod',
  );
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(
    page
      .getByLabel('Stufeninspector')
      .getByRole('heading', { name: 'Iron Rod', exact: true }),
  ).toBeVisible();
});
test('restricted Iron Ore imports do not offer Steel Rod without Coal', async ({
  page,
}) => {
  await ready(page);
  const technology = technologyAtTier(4, ['Recipe_Alternate_SteelRod_C']);
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'iron-only.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: vanillaCatalog.catalogVersion,
        production: {
          targets: [{ itemId: 'Desc_IronRod_C', rate: '15' }],
          recipes: {
            Desc_IronRod_C: 'Recipe_IronRod_C',
            Desc_IronIngot_C: 'Recipe_IngotIron_C',
          },
          imports: ['Desc_OreIron_C'],
          technology,
        },
      }),
    ),
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronRod_C');
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(
    page
      .getByLabel('Rezept für diese Stufe')
      .locator('option[value="Recipe_Alternate_SteelRod_C"]'),
  ).toHaveCount(0);
  await expect(page.getByLabel('Rezept für diese Stufe')).toHaveValue(
    'Recipe_IronRod_C',
  );
  await page.screenshot({
    path: test.info().outputPath('restricted-recipes.png'),
    fullPage: true,
  });
});

test('normalizes repeated technology IDs before candidate probes and subsequent exports', async ({
  page,
}) => {
  await ready(page);
  const technology = technologyAtTier(4, ['Recipe_Alternate_SteelRod_C']);
  const repeated = {
    ...technology,
    availableMachines: Array.from(
      { length: 2000 },
      (_, i) =>
        technology.availableMachines[i % technology.availableMachines.length]!,
    ),
    unlockedRecipes: Array.from(
      { length: 2000 },
      (_, i) =>
        technology.unlockedRecipes[i % technology.unlockedRecipes.length]!,
    ),
  };
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'duplicates.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: vanillaCatalog.catalogVersion,
        production: {
          targets: [{ itemId: 'Desc_IronRod_C', rate: '15' }],
          recipes: {
            Desc_IronRod_C: 'Recipe_IronRod_C',
            Desc_IronIngot_C: 'Recipe_IngotIron_C',
          },
          imports: ['Desc_OreIron_C'],
          technology: repeated,
        },
      }),
    ),
  });
  await expect(page.getByLabel('Produktionsziel')).toHaveValue(
    'Desc_IronRod_C',
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Plan exportieren', exact: true })
    .click();
  const saved = JSON.parse(
    await readFile((await (await download).path())!, 'utf8'),
  );
  expect(saved.production.technology).toEqual(technology);
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
