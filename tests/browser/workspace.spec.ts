import { expect, test } from '@playwright/test';
const url = process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173';
async function ready(page: import('@playwright/test').Page) {
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
}
test('fixed Vanilla workflow, repeated calculations and error recovery', async ({
  page,
}) => {
  await ready(page);
  await expect(page.getByLabel('Discovery-Dateien')).toHaveCount(0);
  await expect(page.getByLabel('Etagenansicht')).toBeVisible();
  await page.getByLabel('Zielrate pro Minute').fill('40');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
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
  await page.getByLabel('Zielrate pro Minute').fill('1/3');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(
    page.getByText('1/3 / min', { exact: true }).first(),
  ).toBeVisible();
});
test('technology applies atomically and interrupted changes preserve the plan', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('Maschine Constructor', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Profil anwenden' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await expect(
    page.getByLabel('Maschine Constructor', { exact: true }),
  ).toBeChecked();
  await page.getByLabel('Maximales Belt-Tier').selectOption('1');
  await page.getByRole('button', { name: 'Profil anwenden' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('exports and reimports multiple targets with matching version; rejects invalid files', async ({
  page,
}) => {
  await ready(page);
  const payload = {
    schemaVersion: 1,
    catalogVersion: 'vanilla-1.0-tools-a1eb2fef-v1',
    production: {
      targets: [
        { itemId: 'Desc_IronPlate_C', rate: '20' },
        { itemId: 'Desc_IronRod_C', rate: '15' },
      ],
      recipes: {
        Desc_IronPlate_C: 'Recipe_IronPlate_C',
        Desc_IronRod_C: 'Recipe_IronRod_C',
        Desc_IronIngot_C: 'Recipe_IngotIron_C',
      },
      imports: ['Desc_OreIron_C'],
    },
  };
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'multi.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page.getByRole('button', { name: 'Navigation', exact: true }).click();
  await expect(
    page.getByText('45 / min', { exact: true }).first(),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Plan exportieren', exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe('satispire-plan.json');
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByText('45 / min', { exact: true }).first(),
  ).toBeVisible();
});
test('panel toggles preserve draft and zoom; narrow keyboard and reduced motion', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await page.getByLabel('Zielrate pro Minute').fill('37');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1.25');
  const selected = await page
    .getByLabel('Stufe auswählen', { exact: true })
    .inputValue();
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(page.getByLabel('Zielrate pro Minute')).toHaveValue('37');
  await expect(page.getByLabel('Stufe auswählen', { exact: true })).toHaveValue(
    selected,
  );
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('1.25');
  await page.reload();
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('1.25');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Zielrate pro Minute').focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('30');
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('30 / min', { exact: true }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await page.locator('.view-options summary').click();
  await page.getByLabel('Flussindikatoren').check();
  expect(
    await page
      .locator('.moving-edge')
      .evaluateAll((nodes) =>
        nodes.every((n) => getComputedStyle(n).animationName === 'none'),
      ),
  ).toBe(true);
});

test('raw-only imports preserve the valid plan and late imports cannot overwrite row edits', async ({
  page,
}) => {
  await ready(page);
  const payload = {
    schemaVersion: 1,
    catalogVersion: 'vanilla-1.0-tools-a1eb2fef-v1',
    production: {
      targets: [{ itemId: 'Desc_OreIron_C', rate: '30' }],
      recipes: {},
      imports: ['Desc_OreIron_C'],
    },
  };
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'raw.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByText('20 / min', { exact: true }).first(),
  ).toBeVisible();
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== 'slow.json') return original.call(this);
      return original.call(this).then(
        (text) =>
          new Promise<string>((resolve) => {
            Object.assign(window, { finishSlowImport: () => resolve(text) });
          }),
      );
    };
  });
  const slow = {
    ...payload,
    production: {
      targets: [{ itemId: 'Desc_IronPlate_C', rate: '60' }],
      recipes: {
        Desc_IronPlate_C: 'Recipe_IronPlate_C',
        Desc_IronIngot_C: 'Recipe_IngotIron_C',
      },
      imports: ['Desc_OreIron_C'],
    },
  };
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'slow.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(slow)),
  });
  await expect(
    page.getByRole('button', { name: 'Plan berechnen', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Reihen', { exact: true }).selectOption('3');
  await page.evaluate(() => {
    (window as unknown as { finishSlowImport: () => void }).finishSlowImport();
  });
  await expect(page.getByLabel('Reihen', { exact: true })).toHaveValue('3');
  await expect(
    page.getByText('20 / min', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Plan berechnen', exact: true }),
  ).toBeEnabled();
});
test('explicit alternate unlock changes the solved chain and exact resource demand', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('Rezepte suchen').fill('Cast Screw');
  await page
    .getByLabel('Rezept Alternate: Cast Screw', { exact: true })
    .check();
  await page.getByRole('button', { name: 'Profil anwenden' }).click();
  await page.getByLabel('Produktionsziel').selectOption('Desc_IronScrew_C');
  await page.getByLabel('Zielrate pro Minute').fill('50');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronScrew_C');
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await page
    .getByLabel('Rezept für diese Stufe')
    .selectOption('Recipe_Alternate_Screw_C');
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('Maximales Belt-Tier').selectOption('1');
  await page.getByRole('button', { name: 'Profil anwenden' }).click();
  await expect(
    page
      .getByLabel('Stufe auswählen')
      .locator('option[value="Desc_IronRod_C"]'),
  ).toHaveCount(1);
  await expect(page.getByLabel('Rezept für diese Stufe')).toHaveValue(
    'Recipe_Alternate_Screw_C',
  );
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(
    page
      .getByLabel('Stufe auswählen')
      .locator('option[value="Desc_IronRod_C"]'),
  ).toHaveCount(0);
  await expect(page.getByText(/25\/2 \/ min/).first()).toBeVisible();
});

test('view presets change content, preserve graph toggle and narrow split fallback', async ({
  page,
}) => {
  await ready(page);
  await page.locator('.view-options summary').click();
  await page.locator('.view-options select').first().selectOption('production');
  await expect(
    page.getByLabel('Produktionsübersicht', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Etagenansicht')).toHaveCount(0);
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(page.getByLabel('Produktionsgraph')).toBeVisible();
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(
    page.getByLabel('Produktionsübersicht', { exact: true }),
  ).toBeVisible();
  await page.locator('.view-options select').first().selectOption('split');
  await expect(page.getByLabel('Etagenansicht')).toBeVisible();
  await expect(
    page.getByLabel('Produktionsübersicht', { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 800, height: 700 });
  await expect(
    page.getByLabel('Produktionsübersicht', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Etagenansicht')).toBeVisible();
  await expect(page.locator('.view-options select').first()).toHaveValue(
    'split',
  );
});

test('technology actions remain reachable in short landscape viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 320 });
  await ready(page);
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  const dialog = page.getByRole('dialog');
  expect(
    await dialog.evaluate((node) => getComputedStyle(node).overflowY),
  ).toBe('auto');
  await page.getByRole('button', { name: 'Profil anwenden' }).click();
  await expect(dialog).toHaveCount(0);
});
