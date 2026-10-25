import { expect, test } from '@playwright/test';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../../src/domain/vanilla.js';

const url =
  (process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173') + '/local';

test('global side settings retain the chosen base side when a parent uses an override', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  const technology = technologyAtTier(2);
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'parent-override.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: vanillaCatalog.catalogVersion,
        production: {
          targets: [{ itemId: 'Desc_IronPlate_C', rate: '20' }],
          recipes: availableChoices(technology),
          imports: ['Desc_OreIron_C'],
          technology,
        },
        layout: {
          rows: 0,
          variant: {
            schemaVersion: 1,
            pattern: 'alternating',
            inputSide: 'west',
            outputSide: 'east',
            overrides: [
              {
                itemId: 'Desc_IronIngot_C',
                inputSide: 'west',
                outputSide: 'north',
              },
            ],
          },
        },
      }),
    ),
  });
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronPlate_C');
  await page.locator('.variant-control summary').click();
  const baseInput = page.getByLabel('Standard-Eingangsseite', { exact: true });
  await baseInput.selectOption('south');
  await expect(baseInput).toHaveValue('south');
  await page.getByLabel('Nur diese Etage').check();
  await page.getByLabel('Eingangsseite', { exact: true }).selectOption('north');
  await expect(page.getByTestId('floor-scene')).toHaveAttribute(
    'data-input-side',
    'north',
  );
});

test('all production goals have a visible heading and equal editable rows', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page.locator('.target-editor summary')).toBeVisible();
  await page
    .getByRole('button', { name: 'Ziel hinzufügen', exact: true })
    .click();
  await expect(
    page.getByLabel('Produktionsziel', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Produktionsziel 2', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.target-editor summary')).toContainText('(2)');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByLabel('Produktionsziel 2', { exact: true }),
  ).toBeVisible();
  await page.locator('.target-editor summary').click();
  await expect(
    page.getByLabel('Produktionsziel', { exact: true }),
  ).toBeHidden();
  await expect(
    page.getByLabel('Produktionsziel 2', { exact: true }),
  ).toBeHidden();
  await page.locator('.target-editor summary').click();
  await expect(
    page.getByLabel('Produktionsziel', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Produktionsziel 2', { exact: true }),
  ).toBeVisible();
});

test('planning and technology controls use German labels', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(
    page
      .getByLabel('Produktionsziel', { exact: true })
      .locator('option:checked'),
  ).toHaveText('Eisenplatte');
  await page
    .getByRole('button', { name: /Technologie/ })
    .first()
    .click();
  await expect(
    page.getByLabel('Maximale Förderbandstufe', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Rezepte suchen').fill('Eisenplatte');
  await expect(page.locator('.recipe-options label').first()).toContainText(
    'Eisenplatte',
  );
});
