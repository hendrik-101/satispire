import { expect, test } from '@playwright/test';

const url = process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173';
test('plans locally, preserves selected stage across panels and recovers from invalid demand', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('.workspace').first()).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Satispire' })).toBeVisible();
  await page.getByLabel('Zielrate pro Minute').fill('40');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(
    page.getByText('40 / min', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(page.getByLabel('Produktionsgraph')).toBeVisible();
  await page.getByLabel('Zielrate pro Minute').fill('0');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByText('40 / min', { exact: true }).first(),
  ).toBeVisible();
});

test('imports discovery without upload and labels unknown real geometry', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') requests.push(request.url());
  });
  await page.goto(url);
  await expect(page.locator('.workspace').first()).toHaveAttribute(
    'data-ready',
    'true',
  );
  const bundle = {
    manifest: {
      schemaVersion: 'satispire.discovery/0.1',
      catalogVersion: 'browser-private-test',
      game: { version: 'test-1', changelist: 123 },
      source: { sha256: 'a'.repeat(64) },
    },
    items: [
      {
        id: 'test:ore2',
        form: 'RF_SOLID',
        provenance: { nativeClass: 'FGResourceDescriptor' },
      },
      {
        id: 'test:ore',
        form: 'RF_SOLID',
        provenance: { nativeClass: 'FGResourceDescriptor' },
      },
      {
        id: 'test:part',
        form: 'RF_SOLID',
        provenance: { nativeClass: 'FGItemDescriptor' },
      },
    ],
    buildings: [{ id: 'test:machine', parameters: { mManufacturingSpeed: 1 } }],
    recipes: [
      {
        id: 'test:raw-output',
        durationSeconds: 6,
        ingredients: [{ itemId: 'test:ore2', quantity: 1 }],
        products: [{ itemId: 'test:ore', quantity: 1 }],
        eligibleProducers: [{ id: 'test:machine', kind: 'buildable' }],
        alternate: false,
        events: null,
        unlockIds: [],
      },
      {
        id: 'test:recipe',
        durationSeconds: 6,
        ingredients: [
          { itemId: 'test:ore', quantity: 3 },
          { itemId: 'test:ore2', quantity: 1 },
        ],
        products: [{ itemId: 'test:part', quantity: 2 }],
        eligibleProducers: [{ id: 'test:machine', kind: 'buildable' }],
        alternate: false,
        events: null,
        unlockIds: [],
      },
    ],
  };
  await page.getByLabel('Discovery-Dateien').setInputFiles(
    Object.entries(bundle).map(([name, data]) => ({
      name: name + '.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(data)),
    })),
  );
  await expect(
    page.getByText('Lokaler Spielimport', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Physische Geometrie und Ports unbekannt.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('30 / min', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(
    page.getByLabel('Produktionsziel').locator('option[value="test:ore"]'),
  ).toHaveCount(0);
  const labels = page.locator('.edge-label');
  await expect(labels).toHaveCount(2);
  const coordinates = await labels.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('x') + ',' + node.getAttribute('y')),
  );
  expect(new Set(coordinates).size).toBe(2);
  expect(requests).toEqual([]);
  await page.getByLabel('Discovery-Dateien').setInputFiles({
    name: 'manifest.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByText('Lokaler Spielimport', { exact: true }),
  ).toBeVisible();
});

test('restores personal layout and stays keyboard usable on a narrow viewport', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('.workspace').first()).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('Produktionsgraph')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Zielrate pro Minute').focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('30');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(
    page.getByText('30 / min', { exact: true }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('preserves all imported targets on unchanged recalculation', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'multi.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: 'synthetic-1',
        production: {
          targets: [
            { itemId: 'example:plate', rate: '20' },
            { itemId: 'example:rod', rate: '15' },
          ],
          recipes: {
            'example:ingot': 'example:smelt',
            'example:plate': 'example:press',
            'example:rod': 'example:shape',
          },
          imports: ['example:ore'],
        },
      }),
    ),
  });
  await expect(
    page.getByText('45 / min', { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(
    page.getByText('45 / min', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('15 / min', { exact: true }).first(),
  ).toBeVisible();
});

for (const preset of ['production', 'split']) {
  test(
    'graph toggle overrides ' +
      preset +
      ' preset without losing draft or selection',
    async ({ page }) => {
      await page.goto(url);
      await expect(page.locator('main.workspace')).toHaveAttribute(
        'data-ready',
        'true',
      );
      await page.getByRole('button', { name: 'Graph', exact: true }).click();
      await page
        .getByRole('combobox', { name: /^Ansicht/ })
        .selectOption(preset);
      await page.getByLabel('Zielrate pro Minute').fill('37');
      const selection = await page
        .getByLabel('Stufe auswählen', { exact: true })
        .inputValue();
      await expect(page.getByLabel('Produktionsgraph')).toBeVisible();
      await page.getByRole('button', { name: 'Graph', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Graph', exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByLabel('Produktionsgraph')).toHaveCount(0);
      await expect(page.getByLabel('Zielrate pro Minute')).toHaveValue('37');
      await expect(
        page.getByLabel('Stufe auswählen', { exact: true }),
      ).toHaveValue(selection);
      await page.reload();
      await expect(page.locator('main.workspace')).toHaveAttribute(
        'data-ready',
        'true',
      );
      await expect(page.getByLabel('Produktionsgraph')).toHaveCount(0);
      await page.getByRole('button', { name: 'Graph', exact: true }).click();
      await expect(page.getByLabel('Produktionsgraph')).toBeVisible();
    },
  );
}

test('can choose another target after importing only the active recipe chain', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'chain-only.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: 'synthetic-1',
        production: {
          targets: [{ itemId: 'example:plate', rate: '20' }],
          recipes: {
            'example:plate': 'example:press',
            'example:ingot': 'example:smelt',
          },
          imports: ['example:ore'],
        },
      }),
    ),
  });
  await expect(
    page.getByText('30 / min', { exact: true }).first(),
  ).toBeVisible();
  await page.getByLabel('Produktionsziel').selectOption('example:rod');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(
    page.getByLabel('Stufe auswählen').locator('option[value="example:rod"]'),
  ).toHaveCount(1);
});

test('responsive presentation preserves saved layout, selection and draft', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await page.getByRole('combobox', { name: /^Ansicht/ }).selectOption('split');
  await page.getByRole('combobox', { name: /^Zoom/ }).selectOption('1.25');
  await page.getByLabel('Zielrate pro Minute').fill('37');
  const selection = await page.getByLabel('Stufe auswählen').inputValue();
  const preferences = await page.evaluate(() =>
    localStorage.getItem('satispire.personal-view.v1'),
  );
  await expect(page.getByLabel('Stufennavigation')).toBeVisible();
  await page.setViewportSize({ width: 1199, height: 850 });
  await expect(page.getByLabel('Stufennavigation')).toHaveCount(0);
  await page.setViewportSize({ width: 800, height: 850 });
  await expect(page.getByLabel('Etagenansicht')).toBeVisible();
  await expect(page.getByLabel('Zielrate pro Minute')).toHaveValue('37');
  await expect(page.getByLabel('Stufe auswählen')).toHaveValue(selection);
  expect(
    await page.evaluate(() =>
      localStorage.getItem('satispire.personal-view.v1'),
    ),
  ).toBe(preferences);
  await page.setViewportSize({ width: 1280, height: 850 });
  await expect(page.getByLabel('Stufennavigation')).toBeVisible();
  await expect(page.getByRole('combobox', { name: /^Ansicht/ })).toHaveValue(
    'split',
  );
});
