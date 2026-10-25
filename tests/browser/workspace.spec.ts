import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { vanillaCatalog } from '../../src/domain/vanilla.js';
const url =
  (process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173') + '/local';
test('rejects a 1.0 plan without replacing the active 1.2 plan', async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator('.catalog-version')).toContainText('1.2.4.0');
  await page.getByLabel('Zielrate pro Minute').fill('40');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'old-1.0.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: 'vanilla-1.0-tools-a1eb2fef-v1',
        production: {
          targets: [{ itemId: 'Desc_IronPlate_C', rate: '20' }],
          recipes: {
            Desc_IronPlate_C: 'Recipe_IronPlate_C',
            Desc_IronIngot_C: 'Recipe_IngotIron_C',
          },
          imports: ['Desc_OreIron_C'],
        },
      }),
    ),
  });
  await expect(page.getByRole('alert')).toContainText('1.2.4.0');
  await expect(
    page.getByText('40 / min', { exact: true }).first(),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Plan exportieren', exact: true })
    .click();
  const exported = JSON.parse(
    await readFile((await (await download).path())!, 'utf8'),
  );
  expect(exported.catalogVersion).toBe(vanillaCatalog.catalogVersion);
  expect(exported.production.targets[0].rate).toBe('40');
});
test('industrial canvas selection links the machine, graph and inspector', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Zielrate pro Minute').fill('80');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  const machine = page.getByRole('button', {
    name: 'Konstruktor 2',
    exact: true,
  });
  await machine.focus();
  await page.keyboard.press('Enter');
  await expect(machine).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Stufeninspector')).toContainText(
    'Konstruktor 2',
  );
  await expect(
    page.getByRole('group', { name: 'Maschinenmaße' }),
  ).toContainText('8,307 m');
  await expect(page.getByRole('group', { name: 'Baufreiraum' })).toContainText(
    'Höhe6 m',
  );
  await page.getByText('Quellen und Lizenzen', { exact: true }).click();
  await expect(page.getByLabel('Quellen und Lizenzen')).toContainText(
    '2026 Greg McDowell',
  );
  await expect(page.getByLabel('Quellen und Lizenzen')).toContainText(
    '2026 Aadit Sachdev',
  );
  await expect(page.locator('.graph-node.selected')).toContainText(
    'Eisenplatte',
  );
  await page.locator('.graph-node').filter({ hasText: 'Eisenbarren' }).click();
  await expect(page.getByLabel('Stufeninspector')).toContainText(
    'Schmelzofen 1',
  );
  await expect(
    page.getByRole('group', { name: 'Maschinenmaße' }),
  ).toContainText('8,575 m');
  await expect(
    page.getByRole('button', { name: 'Schmelzofen 1', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});
test('mobile canvas has compact controls and secondary settings in a sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const drawing = page.locator('.drawing');
  await page.locator('.target-editor summary').click();
  await expect(
    page.getByLabel('Produktionsziel', { exact: true }),
  ).toBeHidden();
  expect((await drawing.boundingBox())!.y).toBeLessThan(190);
  await page.getByRole('button', { name: 'Vergrößern', exact: true }).click();
  await expect(page.getByLabel('Aktueller Zoom')).toHaveText('150 %');
  await page.locator('.view-options summary').click();
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
async function ready(page: import('@playwright/test').Page) {
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  // These canvas scenarios explicitly exercise the target's machines.
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronPlate_C');
}
test('mobile camera reveals keyboard-selected machines and recovers after zoom and pan', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByLabel('Zielrate pro Minute').fill('320');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page.locator('.view-options summary').click();
  await page.getByLabel('Reihen', { exact: true }).selectOption('3');
  await page.keyboard.press('Escape');
  const scene = page.getByTestId('floor-scene');
  const machine = page.getByRole('button', {
    name: 'Konstruktor 6',
    exact: true,
  });
  const sceneBox = (await scene.boundingBox())!;
  const transferBox = (await page
    .getByLabel('Symbolischer Etagenübergang')
    .boundingBox())!;
  expect(transferBox.x).toBeGreaterThanOrEqual(sceneBox.x);
  expect(transferBox.x + transferBox.width).toBeLessThanOrEqual(
    sceneBox.x + sceneBox.width,
  );
  const overview = await scene.getAttribute('viewBox');
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Vergrößern', exact: true }).click();
  }
  await machine.focus();
  await page.keyboard.press('Enter');
  await expect(machine).toHaveAttribute('aria-pressed', 'true');
  const machineBox = (await machine.boundingBox())!;
  expect(machineBox.x + machineBox.width / 2).toBeGreaterThan(sceneBox.x);
  expect(machineBox.x + machineBox.width / 2).toBeLessThan(
    sceneBox.x + sceneBox.width,
  );
  await expect(
    page.getByRole('complementary', { name: 'Stufeninspector' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(
    page.getByRole('complementary', { name: 'Stufeninspector' }),
  ).toHaveCount(0);
  const initialView = await scene.getAttribute('viewBox');
  await page.getByRole('button', { name: 'Vergrößern', exact: true }).click();
  await expect(scene).not.toHaveAttribute('viewBox', initialView!);
  await page
    .getByRole('button', { name: 'Schema einpassen', exact: true })
    .click();
  const fittedView = await scene.getAttribute('viewBox');
  expect(fittedView).toBe(overview);
  expect(Number(fittedView!.split(' ')[2])).toBeGreaterThan(58);
  await page.mouse.move(sceneBox.x + 10, sceneBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(sceneBox.x + 40, sceneBox.y + 20);
  await page.mouse.up();
  await expect(scene).not.toHaveAttribute('viewBox', fittedView!);
  await page
    .getByRole('button', { name: 'Schema einpassen', exact: true })
    .click();
  await expect(scene).toHaveAttribute('viewBox', fittedView!);
});
test('assembler schema exposes separate connected resource feeds', async ({
  page,
}) => {
  await ready(page);
  await page
    .getByLabel('Produktionsziel')
    .selectOption('Desc_IronPlateReinforced_C');
  await page.getByLabel('Zielrate pro Minute').fill('20');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronPlateReinforced_C');
  await expect(
    page.getByRole('button', { name: 'Montagemaschine 1', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByTestId('floor-scene').locator('[data-feed]'),
  ).toHaveCount(2);
  await expect(
    page.locator('.machine-button.selected .machine-port'),
  ).toHaveCount(3);
});
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
    page.getByText('≈ 0,333 / min', { exact: true }).first(),
  ).toBeVisible();
});
test('technology applies atomically and interrupted changes preserve the plan', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('Maschine Konstruktor', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Profil anwenden' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await expect(
    page.getByLabel('Maschine Konstruktor', { exact: true }),
  ).toBeChecked();
  await page.getByLabel('Maximale Förderbandstufe').selectOption('1');
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
    catalogVersion: vanillaCatalog.catalogVersion,
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
test('changing a target combines matching output rows without dropping their demand', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'multi-target.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: vanillaCatalog.catalogVersion,
        production: {
          targets: [
            { itemId: 'Desc_IronPlate_C', rate: '20' },
            { itemId: 'Desc_IronRod_C', rate: '15' },
            { itemId: 'Desc_IronScrew_C', rate: '40' },
          ],
          recipes: {
            Desc_IronPlate_C: 'Recipe_IronPlate_C',
            Desc_IronRod_C: 'Recipe_IronRod_C',
            Desc_IronScrew_C: 'Recipe_Screw_C',
            Desc_IronIngot_C: 'Recipe_IngotIron_C',
          },
          imports: ['Desc_OreIron_C'],
        },
      }),
    ),
  });
  await expect(page.getByLabel('Produktionsziel', { exact: true })).toHaveValue(
    'Desc_IronPlate_C',
  );
  await page
    .getByLabel('Produktionsziel', { exact: true })
    .selectOption('Desc_IronRod_C');
  await page.getByLabel('Zielrate pro Minute', { exact: true }).fill('10');
  for (let calculation = 0; calculation < 2; calculation++) {
    await page
      .getByRole('button', { name: 'Plan berechnen', exact: true })
      .click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Plan exportieren', exact: true })
      .click();
    const document = JSON.parse(
      await readFile((await (await download).path())!, 'utf8'),
    );
    expect(document.production.targets).toEqual([
      { itemId: 'Desc_IronRod_C', rate: '10' },
      { itemId: 'Desc_IronRod_C', rate: '15' },
      { itemId: 'Desc_IronScrew_C', rate: '40' },
    ]);
    await expect(
      page.getByLabel('Stufe auswählen', { exact: true }),
    ).toHaveValue('Desc_IronIngot_C');
    await expect(page.getByLabel('Etagenansicht')).toContainText('35 / min');
  }
  const screenshot = test.info().outputPath('imported-target-replacement.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await test.info().attach('imported target replacement', {
    path: screenshot,
    contentType: 'image/png',
  });
});
test('panel toggles preserve draft and zoom; narrow keyboard and reduced motion', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await page.getByLabel('Zielrate pro Minute').fill('37');
  await page.getByRole('button', { name: 'Vergrößern', exact: true }).click();
  const selected = await page
    .getByLabel('Stufe auswählen', { exact: true })
    .inputValue();
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(page.getByLabel('Zielrate pro Minute')).toHaveValue('37');
  await expect(page.getByLabel('Stufe auswählen', { exact: true })).toHaveValue(
    selected,
  );
  await expect(page.getByLabel('Aktueller Zoom')).toHaveText('120 %');
  await page.reload();
  await expect(page.getByLabel('Aktueller Zoom')).toHaveText('120 %');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Zielrate pro Minute').focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('30');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Stufe auswählen', { exact: true })).toHaveValue(
    'Desc_IronIngot_C',
  );
  await expect(page.getByLabel('Etagenansicht')).toContainText('45 / min');
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
    catalogVersion: vanillaCatalog.catalogVersion,
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
  await page.getByLabel('Rezepte suchen').fill('Gegossene Schrauben');
  await page
    .getByLabel('Rezept Alternativ: Gegossene Schrauben', { exact: true })
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
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page
    .getByLabel('Rezept für diese Stufe')
    .selectOption('Recipe_Alternate_Screw_C');
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('Maximale Förderbandstufe').selectOption('1');
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
  await expect(
    page.getByText('12,5 Stk./min', { exact: true }).first(),
  ).toBeVisible();
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

test('responsive navigation and custom transport shortcuts remain consistent', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Navigation', exact: true }).click();
  const saved = await page.evaluate(() =>
    localStorage.getItem('satispire.personal-view.v2'),
  );
  await page.setViewportSize({ width: 800, height: 700 });
  await expect(
    page.getByRole('button', { name: 'Navigation', exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() =>
      localStorage.getItem('satispire.personal-view.v2'),
    ),
  ).toBe(saved);
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.getByLabel('Stufennavigation')).toBeVisible();
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('HUB-Stufe').selectOption('6');
  await page.getByLabel('Maximale Förderbandstufe').selectOption('1');
  await expect(page.getByLabel('HUB-Stufe')).toHaveValue('custom');
  await page.getByLabel('HUB-Stufe').selectOption('6');
  await expect(page.getByLabel('Maximale Förderbandstufe')).toHaveValue('4');
  await page.getByLabel('Maximale Rohrstufe').selectOption('1');
  await expect(page.getByLabel('HUB-Stufe')).toHaveValue('custom');
  await page.getByLabel('HUB-Stufe').selectOption('6');
  await expect(page.getByLabel('Maximale Rohrstufe')).toHaveValue('2');
});

test('unlocked silicon alternate exposes a supported circuit board chain', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('HUB-Stufe').selectOption('5');
  await page.getByLabel('Rezepte suchen').fill('Siliziumdioxid');
  await page.getByLabel('Rezept Siliziumdioxid', { exact: true }).check();
  await page.getByLabel('Rezepte suchen').fill('Siliziumplatine');
  await page
    .getByLabel('Rezept Alternativ: Siliziumplatine', { exact: true })
    .check();
  await page.getByRole('button', { name: 'Profil anwenden' }).click();
  await page.getByLabel('Produktionsziel').selectOption('Desc_CircuitBoard_C');
  await page.getByLabel('Zielrate pro Minute').fill('7.5');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_CircuitBoard_C');
  await expect(
    page.getByText('7,5 / min', { exact: true }).first(),
  ).toBeVisible();
});

test('profile reseeds inactive automatic choices without overriding a supported alternate', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'minimal-concrete.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: vanillaCatalog.catalogVersion,
        production: {
          targets: [{ itemId: 'Desc_Cement_C', rate: '20' }],
          recipes: { Desc_Cement_C: 'Recipe_Concrete_C' },
          imports: ['Desc_Stone_C', 'Desc_OreIron_C', 'Desc_Coal_C'],
        },
      }),
    ),
  });
  await page.getByLabel('Produktionsziel').selectOption('Desc_Cement_C');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('HUB-Stufe').selectOption('4');
  await page.getByLabel('Rezepte suchen').fill('Stahlstange');
  await page
    .getByLabel('Rezept Alternativ: Stahlstange', { exact: true })
    .check();
  await page.getByLabel('Rezepte suchen').fill('Eisenbarren');
  await page.getByLabel('Rezept Eisenbarren', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Profil anwenden' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('Produktionsziel').selectOption('Desc_IronRod_C');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(
    page
      .getByLabel('Stufe auswählen')
      .locator('option[value="Desc_SteelIngot_C"]'),
  ).toHaveCount(1);
});

test('minimal imports restrict targets and enable alternatives using permitted resources', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'iron-only.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: vanillaCatalog.catalogVersion,
        production: {
          targets: [{ itemId: 'Desc_IronPlate_C', rate: '20' }],
          recipes: {
            Desc_IronPlate_C: 'Recipe_IronPlate_C',
            Desc_IronIngot_C: 'Recipe_IngotIron_C',
          },
          imports: ['Desc_OreIron_C'],
        },
      }),
    ),
  });
  await expect(
    page
      .getByLabel('Produktionsziel')
      .locator('option[value="Desc_CopperSheet_C"]'),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('Rezepte suchen').fill('Eisendraht');
  await page
    .getByLabel('Rezept Alternativ: Eisendraht', { exact: true })
    .check();
  await page.getByRole('button', { name: 'Profil anwenden' }).click();
  await page.getByLabel('Produktionsziel').selectOption('Desc_Wire_C');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
