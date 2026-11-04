import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../../src/domain/vanilla.js';
import type { ProductionInput } from '../../src/domain/production.js';

const url =
  (process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173') + '/local';
const allRecipes = vanillaCatalog.recipes.map((recipe) => recipe.id);
const allImports = vanillaCatalog.items
  .filter((item) => item.raw)
  .map((item) => item.id);

async function importProduction(
  page: import('@playwright/test').Page,
  production: ProductionInput,
) {
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
    { timeout: 15_000 },
  );
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'review-regression.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: vanillaCatalog.catalogVersion,
        production,
      }),
    ),
  });
  await expect(page.getByLabel('Produktionsziel')).toHaveValue(
    production.targets[0]!.itemId,
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
}

for (const scenario of [
  {
    name: 'locked alternate',
    technology: technologyAtTier(2),
    item: 'Desc_IronRod_C',
    recipe: 'Recipe_Alternate_SteelRod_C',
  },
  {
    name: 'supported coproduct recipe',
    technology: technologyAtTier(9, allRecipes),
    item: 'Desc_Silica_C',
    recipe: 'Recipe_AluminaSolution_C',
  },
  {
    name: 'supported dependency chain',
    technology: technologyAtTier(9, allRecipes),
    item: 'Desc_CircuitBoard_C',
    recipe: 'Recipe_CircuitBoard_C',
  },
]) {
  test(`import ignores an inactive ${scenario.name} when selecting another target`, async ({
    page,
  }) => {
    await importProduction(page, {
      targets: [{ itemId: 'Desc_IronPlate_C', rate: '20' }],
      recipes: {
        Desc_IronPlate_C: 'Recipe_IronPlate_C',
        Desc_IronIngot_C: 'Recipe_IngotIron_C',
        [scenario.item]: scenario.recipe,
      },
      imports: allImports,
      technology: scenario.technology,
    });
    const expected = availableChoices(scenario.technology)[scenario.item]!;
    await page.getByLabel('Produktionsziel').selectOption(scenario.item);
    await page.getByLabel('Zielrate pro Minute').fill('1');
    for (let i = 0; i < 2; i++) {
      await page
        .getByRole('button', { name: 'Plan berechnen', exact: true })
        .click();
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    // A coproduct target need not own a separate stage.
    if (scenario.name !== 'supported coproduct recipe')
      await page
        .getByLabel('Stufe auswählen', { exact: true })
        .selectOption(scenario.item);
    await expect(
      page.getByLabel('Rezept für diese Stufe', { exact: true }),
    ).toHaveValue(expected);
    if (scenario.name === 'locked alternate')
      await page.screenshot({
        path: test.info().outputPath('import-default-recovery.png'),
        fullPage: true,
      });
  });
}

test('import preserves active selected alternates while dropping inactive locked overrides', async ({
  page,
}) => {
  const technology = technologyAtTier(2, ['Recipe_Alternate_Screw_C']);
  await importProduction(page, {
    targets: [{ itemId: 'Desc_IronScrew_C', rate: '50' }],
    recipes: {
      Desc_IronScrew_C: 'Recipe_Alternate_Screw_C',
      Desc_IronIngot_C: 'Recipe_IngotIron_C',
      Desc_IronRod_C: 'Recipe_Alternate_SteelRod_C',
    },
    imports: ['Desc_OreIron_C'],
    technology,
  });
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronScrew_C');
  await expect(
    page.getByLabel('Rezept für diese Stufe', { exact: true }),
  ).toHaveValue('Recipe_Alternate_Screw_C');
  await expect(
    page
      .getByLabel('Stufe auswählen')
      .locator('option[value="Desc_IronRod_C"]'),
  ).toHaveCount(0);
});

test('input-free photonic matter has only output ports in the canvas, graph and inspector', async ({
  page,
}) => {
  await importProduction(page, {
    targets: [{ itemId: 'Desc_QuantumEnergy_C', rate: '60' }],
    recipes: { Desc_QuantumEnergy_C: 'Recipe_QuantumEnergy_C' },
    imports: [],
    technology: technologyAtTier(9),
  });
  await expect(
    page.getByTestId('floor-scene').locator('[data-feed]'),
  ).toHaveCount(0);
  await expect(
    page.getByTestId('floor-scene').locator('.supply-belt-input'),
  ).toHaveCount(0);
  await expect(
    page.locator('.machine-button.selected .machine-port'),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.locator('.graph-node.selected .machine-port')).toHaveCount(
    1,
  );
  await expect(
    page.getByLabel('Stufeninspector').locator('.machine-port'),
  ).toHaveCount(1);
  await expect(page.locator('.graph-edge')).toHaveCount(0);
  await expect(
    page.getByTestId('floor-scene').locator('.supply-belt-output'),
  ).not.toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('input-free-photonic.png'),
    fullPage: true,
  });
});

test('advanced graph assigns distinct in-bounds lanes beyond eight bypass edges', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const technology = technologyAtTier(9, allRecipes);
  await importProduction(page, {
    targets: [{ itemId: 'Desc_SpaceElevatorPart_5_C', rate: '1' }],
    recipes: availableChoices(technology),
    imports: allImports,
    technology,
  });
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  const lanes = await page.locator('.graph-edge').evaluateAll((paths) =>
    paths.flatMap((path) => {
      const match = / V ([\d.]+) H /.exec(path.getAttribute('d') ?? '');
      return match ? [Number(match[1])] : [];
    }),
  );
  expect(lanes.length).toBeGreaterThan(8);
  expect(new Set(lanes).size).toBe(lanes.length);
  const height = Number(
    (await page.locator('.process-graph').getAttribute('viewBox'))!.split(
      ' ',
    )[3],
  );
  expect(Math.max(...lanes)).toBeLessThan(height);
  const scroll = page.locator('.graph-scroll');
  expect((await scroll.boundingBox())!.height).toBeGreaterThanOrEqual(300);
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const laneVisibility = await page.locator('.process-graph').evaluate(
    (element, y) => {
      const svg = element as SVGSVGElement;
      const point = svg.createSVGPoint();
      point.y = y;
      const screenY = point.matrixTransform(svg.getScreenCTM()!).y;
      const box = svg.parentElement!.getBoundingClientRect();
      return {
        screenY,
        top: box.top,
        bottom: box.bottom,
        scrollTop: svg.parentElement!.scrollTop,
      };
    },
    Math.max(...lanes),
  );
  expect(laneVisibility.scrollTop).toBeGreaterThan(0);
  expect(laneVisibility.screenY).toBeGreaterThan(laneVisibility.top);
  expect(laneVisibility.screenY).toBeLessThan(laneVisibility.bottom);
  await page.screenshot({
    path: test.info().outputPath('advanced-bypass-lanes.png'),
    fullPage: true,
  });
});

for (const itemId of ['Desc_Rubber_C', 'Desc_Plastic_C', 'Desc_LiquidFuel_C']) {
  test(`tier 5 supports ${itemId} with actual coproduct outputs and export`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1100 });
    const technology = technologyAtTier(5);
    await importProduction(page, {
      targets: [{ itemId, rate: '20' }],
      recipes: availableChoices(technology),
      imports: allImports,
      technology,
    });
    for (const product of [
      'Desc_Rubber_C',
      'Desc_Plastic_C',
      'Desc_LiquidFuel_C',
    ]) {
      await expect(
        page
          .getByLabel('Produktionsziel')
          .locator(`option[value="${product}"]`),
      ).toHaveCount(1);
    }
    await page
      .getByRole('button', { name: 'Plan berechnen', exact: true })
      .click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    const inspector = page.getByLabel('Stufeninspector');
    await expect(inspector.getByLabel('Mengen je Maschine')).toContainText(
      'AUS',
    );
    await expect(
      inspector.getByLabel('Ausgänge der Stufe').locator('li'),
    ).toHaveCount(2);
    await expect(inspector.getByLabel('Überschuss der Fabrik')).toBeVisible();
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await expect(page.locator('.process-graph')).toBeVisible();
    if (itemId === 'Desc_Rubber_C')
      await page.screenshot({
        path: test.info().outputPath('tier5-rubber-floor-inspector.png'),
        fullPage: true,
      });
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Plan exportieren', exact: true })
      .click();
    const document = JSON.parse(
      await readFile((await (await download).path())!, 'utf8'),
    );
    expect(document.production.targets).toEqual([{ itemId, rate: '20' }]);
    await page.getByLabel('Plan-Datei').setInputFiles({
      name: 'coproduct-roundtrip.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel('Produktionsziel')).toHaveValue(itemId);
    await expect(
      inspector.getByLabel('Ausgänge der Stufe').locator('li'),
    ).toHaveCount(2);
    await page.locator('.view-options > summary').click();
    await page
      .getByRole('combobox', { name: 'Ansicht', exact: true })
      .selectOption('production');
    const overview = page.getByLabel('Produktionsübersicht');
    await expect(
      overview
        .locator('tbody tr[aria-selected="true"] td')
        .first()
        .locator('div'),
    ).toHaveCount(2);
    await expect(overview.getByLabel('Überschuss der Fabrik')).toBeVisible();
    if (itemId === 'Desc_Rubber_C')
      await page.screenshot({
        path: test.info().outputPath('tier5-rubber-coproducts.png'),
        fullPage: true,
      });
  });
}

test('tier 5 oil coproduct plan survives a saved session reload', async ({
  page,
}) => {
  const sessionUrl = url.replace(/\/local$/, '/session');
  await page.goto(sessionUrl);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  const technology = technologyAtTier(5);
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'oil-session.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: vanillaCatalog.catalogVersion,
        production: {
          targets: [{ itemId: 'Desc_Rubber_C', rate: '20' }],
          recipes: availableChoices(technology),
          imports: allImports,
          technology,
        },
      }),
    ),
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Sitzungsstatus')).toContainText('Gespeichert');
  const savedUrl = page.url();
  await page.reload();
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  expect(page.url()).toBe(savedUrl);
  await expect(page.getByLabel('Produktionsziel')).toHaveValue('Desc_Rubber_C');
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByLabel('Ausgänge der Stufe').locator('li')).toHaveCount(
    2,
  );
  await expect(page.getByLabel('Überschuss der Fabrik')).toBeVisible();
});

test('preserves a selected recipe alias through import, calculation, profile apply and export', async ({
  page,
}) => {
  const technology = technologyAtTier(9, allRecipes);
  const selectedRecipe = 'Recipe_Alternate_Quartz_Purified_C';
  await importProduction(page, {
    targets: [{ itemId: 'Desc_QuartzCrystal_C', rate: '60' }],
    recipes: {
      ...availableChoices(technology),
      Desc_QuartzCrystal_C: selectedRecipe,
    },
    imports: allImports,
    technology,
  });
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page
    .getByRole('button', { name: 'Profil anwenden', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Plan exportieren', exact: true })
    .click();
  const document = JSON.parse(
    await readFile((await (await download).path())!, 'utf8'),
  );
  expect(document.production.recipes.Desc_QuartzCrystal_C).toBe(selectedRecipe);
  expect(document.production.targets).toEqual([
    { itemId: 'Desc_QuartzCrystal_C', rate: '60' },
  ]);
});
