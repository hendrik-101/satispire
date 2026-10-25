import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../../src/domain/vanilla.js';

async function ready(page: Page) {
  await page.goto(
    (process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173') + '/local',
  );
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
}

async function exportedTargets(page: Page) {
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Plan exportieren', exact: true })
    .click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'))
    .production.targets;
}

test('accepts comma, decimal point and fractions for modular frame targets', async ({
  page,
}) => {
  await ready(page);
  await page
    .getByLabel('Produktionsziel', { exact: true })
    .selectOption('Desc_ModularFrame_C');
  for (const rate of ['7,5', '7.5', '15/2']) {
    await page.getByLabel('Zielrate pro Minute').fill(rate);
    await page
      .getByRole('button', { name: 'Plan berechnen', exact: true })
      .click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await exportedTargets(page)).toEqual([
      { itemId: 'Desc_ModularFrame_C', rate: '15/2' },
    ]);
  }
});

test('sizes a draft target by its input, preserves invalid plans and switches back', async ({
  page,
}) => {
  await ready(page);
  await page
    .getByLabel('Produktionsziel', { exact: true })
    .selectOption('Desc_ModularFrame_C');
  await page.getByLabel('Berechnungsmodus').selectOption('input');
  await page
    .getByLabel('Verfügbarer Input', { exact: true })
    .selectOption('Desc_OreIron_C');
  await page.getByLabel('Inputrate pro Minute').fill('180');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exportedTargets(page)).toEqual([
    { itemId: 'Desc_ModularFrame_C', rate: '15/2' },
  ]);
  await page.getByLabel('Inputrate pro Minute').fill('0');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await exportedTargets(page)).toEqual([
    { itemId: 'Desc_ModularFrame_C', rate: '15/2' },
  ]);
  await page.getByLabel('Inputrate pro Minute').fill('7,5');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exportedTargets(page)).toEqual([
    { itemId: 'Desc_ModularFrame_C', rate: '5/16' },
  ]);
  await page.getByLabel('Berechnungsmodus').selectOption('target');
  await expect(page.getByLabel('Zielrate pro Minute')).toHaveValue('5/16');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  expect(await exportedTargets(page)).toEqual([
    { itemId: 'Desc_ModularFrame_C', rate: '5/16' },
  ]);
});

test('updates input choices for a new target and stays usable on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByLabel('Berechnungsmodus').selectOption('input');
  await page
    .getByLabel('Produktionsziel', { exact: true })
    .selectOption('Desc_Wire_C');
  await expect(
    page.getByLabel('Verfügbarer Input', { exact: true }),
  ).toHaveValue('Desc_OreCopper_C');
  await expect(
    page
      .getByLabel('Verfügbarer Input', { exact: true })
      .locator('option[value="Desc_OreIron_C"]'),
  ).toHaveCount(0);
  await page.getByLabel('Inputrate pro Minute').fill('180');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exportedTargets(page)).toEqual([
    { itemId: 'Desc_Wire_C', rate: '360' },
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('input-sizing-mobile.png'),
    fullPage: true,
  });
});

test('input sizing retains duplicate primary demand from imported plans', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'duplicate-primary.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: vanillaCatalog.catalogVersion,
        production: {
          targets: [
            { itemId: 'Desc_ModularFrame_C', rate: '2' },
            { itemId: 'Desc_ModularFrame_C', rate: '2' },
            { itemId: 'Desc_IronRod_C', rate: '12' },
          ],
          recipes: availableChoices(technologyAtTier(2)),
          imports: ['Desc_OreIron_C'],
        },
      }),
    ),
  });
  await expect(page.getByLabel('Produktionsziel', { exact: true })).toHaveValue(
    'Desc_ModularFrame_C',
  );
  await page.getByLabel('Berechnungsmodus').selectOption('input');
  await page.getByLabel('Inputrate pro Minute').fill('120');
  for (let calculation = 0; calculation < 2; calculation++) {
    await page
      .getByRole('button', { name: 'Plan berechnen', exact: true })
      .click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await exportedTargets(page)).toEqual([
      { itemId: 'Desc_ModularFrame_C', rate: '40/9' },
      { itemId: 'Desc_IronRod_C', rate: '40/3' },
    ]);
  }
});
