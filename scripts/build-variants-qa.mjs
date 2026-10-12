import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/usr/bin/chromium',
});
const page = await browser.newPage({ viewport: { width: 1586, height: 992 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const capture = async (name) => {
  await page.screenshot({
    path: `docs/qa/build-variants-${name}.png`,
    fullPage: true,
  });
};
try {
  await mkdir('docs/qa', { recursive: true });
  await page.goto(process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173');
  await page.locator('main.workspace[data-ready="true"]').waitFor();
  await page.getByLabel('Zielrate pro Minute').fill('320');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page.getByLabel('Reihen', { exact: true }).selectOption('3');
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronIngot_C');
  await capture('floor-one');
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronPlate_C');
  await capture('floor-two');
  await page.locator('.variant-control summary').click();
  await page
    .getByLabel('Bauvariante', { exact: true })
    .selectOption('west-west');
  await page.locator('.variant-control summary').click();
  await capture('same-side');
  await page.locator('.variant-control summary').click();
  await page
    .getByLabel('Bauvariante', { exact: true })
    .selectOption('north-south');
  await page.locator('.variant-control summary').click();
  await capture('vertical');
  await page
    .getByLabel('Produktionsziel')
    .selectOption('Desc_IronPlateReinforced_C');
  await page.getByLabel('Zielrate pro Minute').fill('20');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronPlateReinforced_C');
  await capture('multiple-inputs');
  const { technologyAtTier, vanillaCatalog } = await import(
    '../dist/domain/vanilla.js'
  );
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'external-inputs.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: vanillaCatalog.catalogVersion,
        production: {
          targets: [{ itemId: 'Desc_IronIngot_C', rate: '75' }],
          recipes: { Desc_IronIngot_C: 'Recipe_Alternate_IngotIron_C' },
          imports: ['Desc_OreIron_C', 'Desc_OreCopper_C'],
          technology: technologyAtTier(4, ['Recipe_Alternate_IngotIron_C']),
        },
        layout: {
          rows: 0,
          variant: {
            schemaVersion: 1,
            pattern: 'fixed',
            inputSide: 'west',
            outputSide: 'west',
            overrides: [],
          },
        },
      }),
    ),
  });
  await page.getByLabel('Produktionsziel').waitFor();
  await page
    .getByTestId('floor-scene')
    .locator('[data-feed][data-source-floor="external"]')
    .first()
    .waitFor();
  await capture('external-inputs');
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: 'Schema einpassen', exact: true })
    .click();
  await capture('mobile');
  await page.locator('.variant-control summary').click();
  await capture('mobile-control');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    'Actual Chromium captures: two floors, same-side, vertical, multiple inputs, mobile and contextual control. No page errors.',
  );
} finally {
  await browser.close();
}
