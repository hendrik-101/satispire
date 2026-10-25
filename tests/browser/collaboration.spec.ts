import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const url = process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173';

test('a calculated plan survives F5 in the same unique session', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page).toHaveURL(/\?session=[a-f0-9-]+/);
  const sessionUrl = page.url();
  await page
    .getByLabel('Produktionsziel', { exact: true })
    .selectOption('Desc_IronRod_C');
  await page.getByLabel('Zielrate pro Minute', { exact: true }).fill('75');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByLabel('Session-Status')).toContainText('Gespeichert');
  await page.reload();
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  expect(page.url()).toBe(sessionUrl);
  await expect(page.getByLabel('Produktionsziel', { exact: true })).toHaveValue(
    'Desc_IronRod_C',
  );
  await expect(
    page.getByLabel('Zielrate pro Minute', { exact: true }),
  ).toHaveValue('75');
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Plan exportieren', exact: true })
    .click();
  const plan = JSON.parse(
    await readFile((await (await download).path())!, 'utf8'),
  );
  expect(plan.production.targets).toEqual([
    { itemId: 'Desc_IronRod_C', rate: '75' },
  ]);
  await page.goto(url);
  await expect(page).toHaveURL(sessionUrl);
  await expect(
    page.getByLabel('Zielrate pro Minute', { exact: true }),
  ).toHaveValue('75');
});

test('an unknown local session link does not masquerade as a new plan', async ({
  page,
}) => {
  test.skip(
    Boolean(process.env.VITE_CONVEX_URL),
    'Local fallback acceptance only',
  );
  await page.goto(url + '/?session=' + 'a'.repeat(64));
  await expect(page.getByRole('alert')).toContainText('Session');
  await expect(page.getByLabel('Session-Status')).toContainText('Lokal');
});
