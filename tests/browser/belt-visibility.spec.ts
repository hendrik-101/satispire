import { expect, test } from '@playwright/test';
const url =
  (process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173') + '/local';

test('belt amounts are opt-in, available on hover, and sticky after selection', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');
  const labels = page.locator('[data-load-belt]');
  await expect(labels.first()).toBeAttached();
  await expect(page.locator('[data-load-belt]:visible')).toHaveCount(0);
  await page.locator('.view-options summary').click();
  await page.getByLabel('Bandmengen anzeigen', { exact: true }).check();
  await expect(page.locator('[data-load-belt]:visible')).toHaveCount(
    await labels.count(),
  );
  await page.getByLabel('Bandmengen anzeigen', { exact: true }).uncheck();
  await page.locator('.view-options summary').click();
  const belt = page.locator('.supply-belt[data-belt-id]').first();
  const id = await belt.getAttribute('data-belt-id');
  const point = await belt.locator('.supply-belt-edge').evaluate((el) => {
    const path = el as SVGPathElement;
    const p = path.getPointAtLength(path.getTotalLength() * 0.4);
    const screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  const selectedLabel = page.locator(`[data-load-belt="${id}"]`);
  await page.mouse.move(point.x, point.y);
  await expect(selectedLabel).toBeVisible();
  await page.mouse.click(point.x, point.y);
  await page.mouse.move(1, 1);
  await expect(selectedLabel).toBeVisible();
  await page.locator('.view-options summary').click();
  await page.getByLabel('Bandmengen anzeigen', { exact: true }).check();
  await page.reload();
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('[data-load-belt]:visible')).toHaveCount(
    await page.locator('[data-load-belt]').count(),
  );
});

test('clicking a machine opens its actual recipe, per-machine rates and clock details', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('HUB-Tier').selectOption('4');
  await page
    .getByRole('button', { name: 'Profil anwenden', exact: true })
    .click();
  await page
    .getByLabel('Produktionsziel', { exact: true })
    .selectOption('Desc_SteelPlate_C');
  await page.getByLabel('Zielrate pro Minute', { exact: true }).fill('52,5');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_SteelPlate_C');
  await expect(
    page.getByRole('complementary', { name: 'Stufeninspector' }),
  ).toHaveCount(0);
  await page.locator('[data-machine-id="1"]').click();
  const inspector = page.getByRole('complementary', {
    name: 'Stufeninspector',
  });
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText('Steel Beam');
  await expect(inspector).toContainText('87,5 % · Untertaktet');
  await expect(inspector.getByLabel('Mengen je Maschine')).toContainText(
    '13,125 Stk./min',
  );
  await expect(inspector.getByLabel('Mengen je Maschine')).toContainText(
    '52,5 Stk./min',
  );
  await expect(inspector).toContainText('Versorgung der Stufe');
});
