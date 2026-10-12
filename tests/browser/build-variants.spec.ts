import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const url = process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173';
async function ready(page: Page) {
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
}
async function exported(page: Page) {
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Plan exportieren', exact: true })
    .click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}
async function upload(page: Page, document: unknown) {
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'variants.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  });
}
test('alternates two dependency floors, changes same-side and vertical variants, preserves export/import', async ({
  page,
}) => {
  await ready(page);
  const scene = page.getByTestId('floor-scene');
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronIngot_C');
  await expect(scene).toHaveAttribute('data-input-side', 'west');
  await expect(scene).toHaveAttribute('data-output-side', 'east');
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronPlate_C');
  await expect(scene).toHaveAttribute('data-input-side', 'east');
  await expect(scene).toHaveAttribute('data-output-side', 'west');
  await page.locator('.variant-control summary').click();
  await page
    .getByLabel('Bauvariante', { exact: true })
    .selectOption('west-west');
  await expect(scene).toHaveAttribute('data-input-side', 'west');
  await expect(scene).toHaveAttribute('data-output-side', 'west');
  await page.getByLabel('Reihen', { exact: true }).selectOption('2');
  const sameSide = await exported(page);
  await page.locator('.variant-control summary').click();
  expect(sameSide.layout).toMatchObject({
    rows: 2,
    variant: { pattern: 'fixed', inputSide: 'west', outputSide: 'west' },
  });
  await page
    .getByLabel('Bauvariante', { exact: true })
    .selectOption('north-south');
  await expect(scene).toHaveAttribute('data-input-side', 'south');
  await upload(page, sameSide);
  await expect(scene).toHaveAttribute('data-input-side', 'west');
  await expect(page.getByLabel('Reihen', { exact: true })).toHaveValue('2');
  await upload(page, {
    ...sameSide,
    layout: {
      ...sameSide.layout,
      variant: { ...sameSide.layout.variant, inputSide: 'up' },
    },
  });
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await exported(page)).layout).toEqual(sameSide.layout);
});
test('groups multiple feeds on one side, keeps contextual floor overrides, and fits mobile transfers', async ({
  page,
}) => {
  await ready(page);
  await page
    .getByLabel('Produktionsziel')
    .selectOption('Desc_IronPlateReinforced_C');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronPlateReinforced_C');
  const scene = page.getByTestId('floor-scene');
  await expect(scene.locator('[data-feed]')).toHaveCount(2);
  await page.locator('.variant-control summary').click();
  await page.getByLabel('Nur diese Etage').check();
  await page.getByLabel('Eingangsseite').selectOption('north');
  await page.getByLabel('Ausgangsseite').selectOption('north');
  await expect(scene).toHaveAttribute('data-input-side', 'north');
  await expect(scene).toHaveAttribute('data-output-side', 'north');
  expect((await exported(page)).layout.variant.overrides).toEqual([
    {
      itemId: 'Desc_IronPlateReinforced_C',
      inputSide: 'north',
      outputSide: 'north',
    },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.variant-control summary').click();
  await page
    .getByRole('button', { name: 'Schema einpassen', exact: true })
    .click();
  const bounds = await scene.evaluate((svg) => {
    const box = svg.getBoundingClientRect();
    return Array.from(
      svg.querySelectorAll('[data-machine-id], .transfer-module, [data-feed]'),
    ).every((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.left >= box.left - 1 &&
        r.right <= box.right + 1 &&
        r.top >= box.top - 1 &&
        r.bottom <= box.bottom + 1
      );
    });
  });
  expect(bounds).toBe(true);
  const fitted = await scene.getAttribute('viewBox');
  await page.getByRole('button', { name: 'Vergrößern', exact: true }).click();
  await expect(scene).not.toHaveAttribute('viewBox', fitted!);
  await page
    .getByRole('button', { name: 'Schema einpassen', exact: true })
    .click();
  await expect(scene).toHaveAttribute('viewBox', fitted!);
});
test('every machine joins its full row manifolds and aggregate line counts stay explicit', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Zielrate pro Minute').fill('320');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page.getByLabel('Reihen', { exact: true }).selectOption('3');
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronIngot_C');
  const scene = page.getByTestId('floor-scene');
  const firstRow = scene.locator('[data-input-row="0"] path.supply-belt-edge');
  await expect(firstRow).toHaveCount(1);
  const connected = await scene.evaluate((svg) => {
    const rail = svg.querySelector<SVGPathElement>(
      '[data-input-row="0"] path.supply-belt-edge',
    )!;
    const ends = [
      rail.getPointAtLength(0).x,
      rail.getPointAtLength(rail.getTotalLength()).x,
    ];
    const junctions = Array.from(
      svg.querySelectorAll<SVGRectElement>('[data-row="0"] .supply-junction'),
    ).filter((r) => r.getAttribute('fill') === '#4a819e');
    return (
      junctions.length > 1 &&
      junctions.every(
        (r) =>
          Number(r.getAttribute('x')) + 0.5 >= Math.min(...ends) &&
          Number(r.getAttribute('x')) + 0.5 <= Math.max(...ends),
      )
    );
  });
  expect(connected).toBe(true);
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronPlate_C');
  await expect(scene.locator('[data-feed="1"]')).toContainText('4×');
  await expect(scene.locator('[data-aggregate="output"]')).toContainText('3×');
});
test('external ore feeds share one intake side without fake transfers and obsolete overrides do not block target changes', async ({
  page,
}) => {
  await ready(page);
  const document = await exported(page);
  const { technologyAtTier } = await import('../../src/domain/vanilla.js');
  document.production = {
    targets: [{ itemId: 'Desc_IronIngot_C', rate: '75' }],
    recipes: { Desc_IronIngot_C: 'Recipe_Alternate_IngotIron_C' },
    imports: ['Desc_OreIron_C', 'Desc_OreCopper_C'],
    technology: technologyAtTier(4, ['Recipe_Alternate_IngotIron_C']),
  };
  document.layout = {
    rows: 0,
    variant: {
      schemaVersion: 1,
      pattern: 'fixed',
      inputSide: 'west',
      outputSide: 'west',
      overrides: [],
    },
  };
  await upload(page, document);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const scene = page.getByTestId('floor-scene');
  await expect(
    scene.locator(
      '[data-feed][data-source-floor="external"][data-side="west"]',
    ),
  ).toHaveCount(2);
  await expect(scene.locator('.transfer-module')).toHaveCount(0);
  await page.locator('.variant-control summary').click();
  await page.getByLabel('Nur diese Etage').check();
  await page.getByLabel('Eingangsseite').selectOption('north');
  await page.getByLabel('Produktionsziel').selectOption('Desc_CopperIngot_C');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Stufe auswählen', { exact: true })).toHaveValue(
    'Desc_CopperIngot_C',
  );
  expect((await exported(page)).layout.variant.overrides).toEqual([]);
});
test('mixed raw/manufactured targets keep canvas, selector and inspector on the same target floor', async ({
  page,
}) => {
  await ready(page);
  const document = await exported(page);
  document.production.targets = [
    { itemId: 'Desc_OreIron_C', rate: '30' },
    { itemId: 'Desc_Cable_C', rate: '20' },
  ];
  await upload(page, document);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Stufe auswählen', { exact: true })).toHaveValue(
    'Desc_Cable_C',
  );
  await expect(page.getByTestId('floor-scene')).toHaveAttribute(
    'aria-label',
    'Blockschema Cable',
  );
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(
    page
      .getByLabel('Stufeninspector')
      .getByRole('heading', { name: 'Cable', exact: true }),
  ).toBeVisible();
});
test('north-facing output exits above the machines instead of crossing the block interior', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Zielrate pro Minute').fill('240');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page.getByLabel('Reihen', { exact: true }).selectOption('3');
  await page.locator('.variant-control summary').click();
  await page.getByLabel('Nur diese Etage').check();
  await page.getByLabel('Ausgangsseite').selectOption('north');
  const scene = page.getByTestId('floor-scene');
  const clean = await scene.evaluate((svg) => {
    const machines = Array.from(
      svg.querySelectorAll<SVGGElement>('[data-machine-id]'),
    ).map((m) => m.getBBox());
    const paths = Array.from(
      svg.querySelectorAll<SVGPathElement>(
        '[data-output-attachment] .supply-belt-edge',
      ),
    );
    return (
      paths.length > 0 &&
      paths.every((path) => {
        const length = path.getTotalLength();
        for (let d = 0; d <= length; d += 0.25) {
          const p = path.getPointAtLength(d);
          if (
            machines.some(
              (m) =>
                p.x > m.x &&
                p.x < m.x + m.width &&
                p.y > m.y &&
                p.y < m.y + m.height,
            )
          )
            return false;
        }
        return true;
      })
    );
  });
  expect(clean).toBe(true);
});
test('mobile fit keeps a single machine readable while retaining its transfer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const glyph = page.getByRole('button', {
    name: 'Constructor 1',
    exact: true,
  });
  expect((await glyph.boundingBox())!.width).toBeGreaterThanOrEqual(40);
});
test('side controls edit the effective input on an alternating odd floor', async ({
  page,
}) => {
  await ready(page);
  await page.locator('.variant-control summary').click();
  await expect(page.getByLabel('Eingangsseite')).toHaveValue('east');
  await expect(page.getByLabel('Ausgangsseite')).toHaveValue('west');
  await page.getByLabel('Eingangsseite').selectOption('north');
  const scene = page.getByTestId('floor-scene');
  await expect(scene).toHaveAttribute('data-input-side', 'north');
  await expect(scene).toHaveAttribute('data-output-side', 'west');
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronIngot_C');
  await expect(scene).toHaveAttribute('data-input-side', 'west');
  await expect(scene).toHaveAttribute('data-output-side', 'north');
});
