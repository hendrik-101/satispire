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

async function changeTarget(page: Page, itemId: string) {
  await page.getByLabel('Produktionsziel').selectOption(itemId);
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
}

test('opens the first dependency floor instead of the target floor', async ({
  page,
}) => {
  await ready(page);
  await expect(page.getByLabel('Stufe auswählen', { exact: true })).toHaveValue(
    'Desc_IronIngot_C',
  );
  await expect(page.getByTestId('floor-scene')).toHaveAttribute(
    'data-floor-index',
    '0',
  );
});

test('falls back to floor one when replacing the selected target', async ({
  page,
}) => {
  await ready(page);
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronPlate_C');
  await changeTarget(page, 'Desc_IronRod_C');
  await expect(page.getByLabel('Stufe auswählen', { exact: true })).toHaveValue(
    'Desc_IronIngot_C',
  );
  await expect(page.getByTestId('floor-scene')).toHaveAttribute(
    'data-floor-index',
    '0',
  );
});

test('keeps an explicitly selected stage across recalculation and target changes', async ({
  page,
}) => {
  await ready(page);
  const selection = page.getByLabel('Stufe auswählen', { exact: true });
  await selection.selectOption('Desc_IronPlate_C');
  await page.getByLabel('Zielrate pro Minute').fill('40');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(selection).toHaveValue('Desc_IronPlate_C');
  await selection.selectOption('Desc_IronIngot_C');
  await changeTarget(page, 'Desc_IronRod_C');
  await expect(selection).toHaveValue('Desc_IronIngot_C');
  await changeTarget(page, 'Desc_Cable_C');
  await expect(selection).toHaveValue('Desc_CopperIngot_C');
});
