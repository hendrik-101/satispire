import { expect, test } from '@playwright/test';
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
    name: 'coproduct recipe',
    technology: technologyAtTier(9, allRecipes),
    item: 'Desc_Silica_C',
    recipe: 'Recipe_AluminaSolution_C',
  },
  {
    name: 'unsupported dependency chain',
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
