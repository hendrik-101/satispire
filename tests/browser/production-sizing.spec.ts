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
    .getByLabel('Verfügbares Material', { exact: true })
    .selectOption('Desc_OreIron_C');
  await page.getByLabel('Eingangsmenge pro Minute').fill('180');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exportedTargets(page)).toEqual([
    { itemId: 'Desc_ModularFrame_C', rate: '15/2' },
  ]);
  await page.getByLabel('Eingangsmenge pro Minute').fill('0');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await exportedTargets(page)).toEqual([
    { itemId: 'Desc_ModularFrame_C', rate: '15/2' },
  ]);
  await page.getByLabel('Eingangsmenge pro Minute').fill('7,5');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exportedTargets(page)).toEqual([
    { itemId: 'Desc_ModularFrame_C', rate: '5/16' },
  ]);
  await page.getByLabel('Berechnungsmodus').selectOption('target');
  await expect(page.getByLabel('Zielrate pro Minute')).toHaveValue('0,3125');
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
    page.getByLabel('Verfügbares Material', { exact: true }),
  ).toHaveValue('Desc_OreCopper_C');
  await expect(
    page
      .getByLabel('Verfügbares Material', { exact: true })
      .locator('option[value="Desc_OreIron_C"]'),
  ).toHaveCount(0);
  await page.getByLabel('Eingangsmenge pro Minute').fill('180');
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
  await page.getByLabel('Eingangsmenge pro Minute').fill('120');
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

test('sizes total factory consumption or one stage input without changing target proportions', async ({
  page,
}) => {
  await ready(page);
  const technology = { ...technologyAtTier(4), beltTier: 2 };
  const targets = [
    { itemId: 'Desc_SteelPipe_C', rate: '20' },
    { itemId: 'Desc_SteelPlate_C', rate: '33/2' },
    { itemId: 'Desc_SteelPlateReinforced_C', rate: '12' },
  ];
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'steel-sizing.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: vanillaCatalog.catalogVersion,
        production: {
          targets,
          recipes: availableChoices(technology),
          imports: vanillaCatalog.items
            .filter((item) => item.raw)
            .map((item) => item.id),
          technology,
        },
      }),
    ),
  });
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_SteelPlate_C');
  await page.getByLabel('Berechnungsmodus').selectOption('input');
  await page
    .getByLabel('Verfügbares Material', { exact: true })
    .selectOption('Desc_SteelIngot_C');
  await page.getByLabel('Eingangsmenge pro Minute').fill('240');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exportedTargets(page)).toEqual(targets);
  await expect(page.locator('[data-feed-label="1"]')).toContainText(
    '210 Stk./min',
  );
  await page
    .getByLabel('Skalierungsbezug')
    .selectOption('stage:Desc_SteelPlate_C');
  await page
    .getByLabel('Verfügbares Material', { exact: true })
    .selectOption('Desc_SteelIngot_C');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exportedTargets(page)).toEqual([
    { itemId: 'Desc_SteelPipe_C', rate: '160/7' },
    { itemId: 'Desc_SteelPlate_C', rate: '132/7' },
    { itemId: 'Desc_SteelPlateReinforced_C', rate: '96/7' },
  ]);
  await expect(page.locator('[data-feed-label="1"]')).toContainText(
    '240 Stk./min',
  );
  await expect(page.locator('.canvas-summary')).toContainText('100 % Takt');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel('Skalierungsbezug').selectOption('factory');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  expect(await exportedTargets(page)).toEqual(targets);
});
