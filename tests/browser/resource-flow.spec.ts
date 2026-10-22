import { expect, test } from '@playwright/test';
const url = process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173';
test('resource colors and icons identify inputs and persist at their source output', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
    { timeout: 30000 },
  );
  await page.getByLabel('Produktionsziel').selectOption('Desc_ModularFrame_C');
  await page.getByLabel('Zielrate pro Minute').fill('15/2');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronPlateReinforced_C');
  const scene = page.getByTestId('floor-scene');
  const plate = scene
    .locator(
      '.supply-belt[data-resource-id="Desc_IronPlate_C"] .supply-belt-edge',
    )
    .first();
  const screw = scene
    .locator(
      '.supply-belt[data-resource-id="Desc_IronScrew_C"] .supply-belt-edge',
    )
    .first();
  await expect(plate).toHaveCount(1);
  const plateColor = await plate.getAttribute('stroke');
  expect(await screw.getAttribute('stroke')).not.toBe(plateColor);
  expect(
    await scene.locator('.supply-belt-edge').evaluateAll((paths) =>
      paths.every((path) => {
        const reference = path.getAttribute('marker-end')!;
        const marker = document.getElementById(reference.slice(5, -1));
        return (
          marker?.querySelector('path')?.getAttribute('fill') ===
          path.getAttribute('stroke')
        );
      }),
    ),
  ).toBe(true);
  await expect(
    scene.locator('[data-feed="1"] [data-resource-icon="Desc_IronPlate_C"]'),
  ).toHaveCount(1);
  await expect(
    scene.locator('[data-feed="2"] [data-resource-icon="Desc_IronScrew_C"]'),
  ).toHaveCount(1);
  await expect(
    scene.locator(
      '[data-aggregate="output"] [data-resource-icon="Desc_IronPlateReinforced_C"]',
    ),
  ).toHaveCount(1);
  const port = scene.locator(
    '.machine-button.selected .machine-port[data-resource-id="Desc_IronPlate_C"]',
  );
  await expect(port).toHaveAttribute('fill', plateColor!);
  await page.screenshot({
    path: test.info().outputPath('resource-inputs-mobile.png'),
    fullPage: true,
  });
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronPlate_C');
  const source = scene
    .locator(
      '.supply-belt-output[data-resource-id="Desc_IronPlate_C"] .supply-belt-edge',
    )
    .first();
  await expect(source).toHaveAttribute('stroke', plateColor!);
  await expect(
    scene.locator(
      '[data-aggregate="output"] [data-resource-icon="Desc_IronPlate_C"]',
    ),
  ).toHaveCount(1);
});
