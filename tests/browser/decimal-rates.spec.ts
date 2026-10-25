import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../../src/domain/vanilla.js';

test('shows decimal rates in target rows and connection cards while exports stay exact', async ({
  page,
}) => {
  await page.goto(process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173');
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  const technology = technologyAtTier(4);
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'fractional-rates.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: vanillaCatalog.catalogVersion,
        production: {
          targets: [
            { itemId: 'Desc_SteelPlate_C', rate: '33/2' },
            { itemId: 'Desc_SteelPipe_C', rate: '1/3' },
          ],
          recipes: availableChoices(technology),
          imports: vanillaCatalog.items.filter((i) => i.raw).map((i) => i.id),
          technology,
        },
      }),
    ),
  });
  await expect(
    page.getByLabel('Zielrate pro Minute', { exact: true }),
  ).toHaveValue('16,5');
  await expect(
    page.getByTestId('floor-scene').locator('[data-target-delivery]'),
  ).toHaveText('→ Ziel · 16,5 Stk./min');
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_SteelPipe_C');
  await expect(
    page.getByTestId('floor-scene').locator('[data-target-delivery]'),
  ).toHaveText('→ Ziel · ≈ 0,333 Stk./min');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Plan exportieren', exact: true })
    .click();
  const document = JSON.parse(
    await readFile((await (await download).path())!, 'utf8'),
  );
  expect(document.production.targets).toEqual([
    { itemId: 'Desc_SteelPlate_C', rate: '33/2' },
    { itemId: 'Desc_SteelPipe_C', rate: '1/3' },
  ]);
});

test('preserves fraction text while typing and formats only the calculated value', async ({
  page,
}) => {
  await page.goto(process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173');
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  const rate = page.getByLabel('Zielrate pro Minute', { exact: true });
  await rate.fill('');
  await rate.pressSequentially('3/20');
  await expect(rate).toHaveValue('3/20');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(rate).toHaveValue('0,15');
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Plan exportieren', exact: true })
    .click();
  const document = JSON.parse(
    await readFile((await (await download).path())!, 'utf8'),
  );
  expect(document.production.targets[0].rate).toBe('3/20');
});
