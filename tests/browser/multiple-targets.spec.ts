import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const url = process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173';
test('adds, edits, removes and round-trips multiple production goals', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');
  await page
    .getByLabel('Produktionsziel', { exact: true })
    .selectOption('Desc_IronPlate_C');
  await page.getByLabel('Zielrate pro Minute', { exact: true }).fill('20');
  await page
    .getByRole('button', { name: 'Ziel hinzufügen', exact: true })
    .click();
  await page
    .getByLabel('Produktionsziel 2', { exact: true })
    .selectOption('Desc_IronRod_C');
  await page.getByLabel('Zielrate pro Minute 2', { exact: true }).fill('16,5');
  await page
    .getByRole('button', { name: 'Ziel hinzufügen', exact: true })
    .click();
  await page
    .getByLabel('Produktionsziel 3', { exact: true })
    .selectOption('Desc_IronScrew_C');
  await page.getByLabel('Zielrate pro Minute 3', { exact: true }).fill('12');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  async function exported() {
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Plan exportieren', exact: true })
      .click();
    return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  }
  const saved = await exported();
  expect(saved.production.recipes).toMatchObject({
    Desc_IronPlate_C: 'Recipe_IronPlate_C',
    Desc_IronRod_C: 'Recipe_IronRod_C',
    Desc_IronScrew_C: 'Recipe_Screw_C',
  });
  expect(saved.production.targets).toEqual([
    { itemId: 'Desc_IronPlate_C', rate: '20' },
    { itemId: 'Desc_IronRod_C', rate: '33/2' },
    { itemId: 'Desc_IronScrew_C', rate: '12' },
  ]);
  await page.getByLabel('Zielrate pro Minute 2', { exact: true }).fill('-1');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await exported()).production.targets).toEqual(
    saved.production.targets,
  );
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'multiple.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(
    page.getByLabel('Zielrate pro Minute 2', { exact: true }),
  ).toHaveValue('16,5');
  expect((await exported()).production.recipes).toEqual(
    saved.production.recipes,
  );
  await page
    .getByRole('button', { name: 'Ziel 2 entfernen', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  expect((await exported()).production.targets).toEqual([
    saved.production.targets[0],
    saved.production.targets[2],
  ]);
  await page.screenshot({
    path: test.info().outputPath('multiple-targets-desktop.png'),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  if ((await page.locator('.target-editor').getAttribute('open')) === null)
    await page.locator('.target-editor summary').click();
  await expect(
    page.getByLabel('Produktionsziel 2', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Zielrate pro Minute 2', { exact: true }).fill('24');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  expect((await exported()).production.targets[1].rate).toBe('24');
  await page.screenshot({
    path: test.info().outputPath('multiple-targets-mobile.png'),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('input sizing ignores an invalid disabled primary output rate', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');
  await page.getByLabel('Zielrate pro Minute', { exact: true }).fill('');
  await page.getByLabel('Berechnungsmodus').selectOption('input');
  await page.getByLabel('Inputrate pro Minute').fill('180');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('Berechnungsmodus').selectOption('target');
  await expect(
    page.getByLabel('Zielrate pro Minute', { exact: true }),
  ).toHaveValue('120');
});

test('export includes added and edited goals before an explicit recalculation', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');
  await page
    .getByRole('button', { name: 'Ziel hinzufügen', exact: true })
    .click();
  await page
    .getByLabel('Produktionsziel 2', { exact: true })
    .selectOption('Desc_IronRod_C');
  await page.getByLabel('Zielrate pro Minute 2', { exact: true }).fill('16,5');
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Plan exportieren', exact: true })
    .click();
  const saved = JSON.parse(
    await readFile((await (await download).path())!, 'utf8'),
  );
  expect(saved.production.targets).toEqual([
    { itemId: 'Desc_IronPlate_C', rate: '20' },
    { itemId: 'Desc_IronRod_C', rate: '33/2' },
  ]);
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'draft-goals.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(
    page.getByLabel('Zielrate pro Minute 2', { exact: true }),
  ).toHaveValue('16,5');
});

test('all goals share desktop rows and mobile disclosure, including removing the first goal', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');
  for (const [number, item] of [
    [2, 'Desc_IronRod_C'],
    [3, 'Desc_IronScrew_C'],
  ] as const) {
    await page
      .getByRole('button', { name: 'Ziel hinzufügen', exact: true })
      .click();
    await page
      .getByLabel(`Produktionsziel ${number}`, { exact: true })
      .selectOption(item);
    await page
      .getByLabel(`Zielrate pro Minute ${number}`, { exact: true })
      .fill(String(number * 10));
  }
  for (const name of [
    'Produktionsziel',
    'Produktionsziel 2',
    'Produktionsziel 3',
  ])
    await expect(page.getByLabel(name, { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Ziel 1 entfernen', exact: true })
    .click();
  await expect(page.getByLabel('Produktionsziel', { exact: true })).toHaveValue(
    'Desc_IronRod_C',
  );
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Plan exportieren', exact: true })
    .click();
  const saved = JSON.parse(
    await readFile((await (await download).path())!, 'utf8'),
  );
  expect(saved.production.targets).toEqual([
    { itemId: 'Desc_IronRod_C', rate: '20' },
    { itemId: 'Desc_IronScrew_C', rate: '30' },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  const details = page.locator('.target-editor');
  if ((await details.getAttribute('open')) !== null)
    await details.locator('summary').click();
  for (const name of ['Produktionsziel', 'Produktionsziel 2'])
    await expect(page.getByLabel(name, { exact: true })).toBeHidden();
  await details.locator('summary').click();
  for (const name of ['Produktionsziel', 'Produktionsziel 2'])
    await expect(page.getByLabel(name, { exact: true })).toBeVisible();
});

test('input sizing preserves the promoted goals demand ratio after removing the first goal', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');
  async function exported() {
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Plan exportieren', exact: true })
      .click();
    return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  }
  const saved = await exported();
  saved.production.targets = [
    { itemId: 'Desc_IronPlate_C', rate: '20' },
    { itemId: 'Desc_IronRod_C', rate: '30' },
    { itemId: 'Desc_IronScrew_C', rate: '40' },
  ];
  saved.production.imports = ['Desc_OreIron_C'];
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'three-goals.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(
    page.getByLabel('Zielrate pro Minute 3', { exact: true }),
  ).toHaveValue('40');
  await page.getByLabel('Berechnungsmodus').selectOption('input');
  await page.getByLabel('Inputrate pro Minute').fill('180');
  await page
    .getByRole('button', { name: 'Ziel 1 entfernen', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await exported()).production.targets).toEqual([
    { itemId: 'Desc_IronRod_C', rate: '135' },
    { itemId: 'Desc_IronScrew_C', rate: '180' },
  ]);
});
