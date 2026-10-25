import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto(
    (process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173') + '/local',
  );
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
}

test('floors preserve the same world origin, machine scale, and shaft coordinates', async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator('.canvas-grid-key')).toContainText('EIN = Eingang');
  await expect(page.locator('.canvas-grid-key')).toContainText('AUS = Ausgang');
  const scene = page.getByTestId('floor-scene');
  const snapshot = () =>
    scene.evaluate((svg) => {
      const matrix = (svg as unknown as SVGSVGElement).getScreenCTM()!;
      return {
        origin: [matrix.e, matrix.f],
        scale: matrix.a,
        shafts: Array.from(svg.querySelectorAll('[data-shaft-id]')).map(
          (shaft) => ({
            id: shaft.getAttribute('data-shaft-id'),
            transform: shaft.getAttribute('transform'),
          }),
        ),
      };
    });
  const first = await snapshot();
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronPlate_C');
  const second = await snapshot();
  expect(second.origin).toEqual(first.origin);
  expect(second.scale).toBe(first.scale);
  expect(second.shafts).toEqual(first.shafts);
  await page.getByRole('button', { name: 'Vergrößern', exact: true }).click();
  await expect(page.getByLabel('Aktueller Zoom')).toHaveText('120 %');
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronIngot_C');
  await expect(page.getByLabel('Aktueller Zoom')).toHaveText('120 %');
  await page
    .getByRole('button', { name: 'Schema einpassen', exact: true })
    .click();
  await expect(page.getByLabel('Aktueller Zoom')).toHaveText('100 %');
});
