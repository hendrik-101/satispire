import { expect, test } from '@playwright/test';

const base = process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4178';
test.skip(
  process.env.SATISPIRE_TEST_ONLINE !== '1',
  'Requires the built Site Worker and real database',
);

test('real Site database creates a room, shares edits, reloads and records compensating undo', async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const alice = await first.newPage();
    const bob = await second.newPage();
    const errors: string[] = [];
    alice.on('pageerror', (error) => errors.push(error.message));
    bob.on('pageerror', (error) => errors.push(error.message));
    await alice.goto(base);
    await expect(
      alice.getByRole('dialog', { name: 'Deine Räume' }),
    ).toBeVisible();
    await alice.getByRole('button', { name: 'Neuen Raum starten' }).click();
    await expect(alice).toHaveURL(/\/room\/[a-f\d-]+#key=[a-f\d]{64}$/);
    const link = alice.url();
    await expect(alice.locator('main.workspace')).toHaveAttribute(
      'data-ready',
      'true',
    );
    await expect(
      alice.getByRole('status').filter({ hasText: 'Verbunden' }),
    ).toBeVisible();
    await expect(alice.getByLabel('Raum-Link', { exact: true })).toHaveValue(
      link,
    );
    await bob.goto(link);
    await expect(bob.locator('main.workspace')).toHaveAttribute(
      'data-ready',
      'true',
    );
    await expect(
      bob.getByRole('status').filter({ hasText: 'Verbunden' }),
    ).toBeVisible();
    await alice.getByLabel('Zielrate pro Minute', { exact: true }).fill('40');
    await alice
      .getByRole('button', { name: 'Plan berechnen', exact: true })
      .click();
    await expect(
      bob.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('40');
    await bob.reload();
    await expect(
      bob.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('40');
    expect(bob.url()).toBe(link);
    await alice.getByRole('button', { name: 'Historie', exact: true }).click();
    await expect(
      alice.getByRole('complementary', { name: 'Änderungshistorie' }),
    ).toContainText('Outputs');
    await alice
      .getByRole('button', { name: 'Änderung 1 rückgängig machen' })
      .click();
    await expect(
      bob.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('20');
    await expect(
      alice.getByRole('complementary', { name: 'Änderungshistorie' }),
    ).toContainText('Rückgängig: Outputs');
    await alice.reload();
    await expect(
      alice.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('20');
    await alice.getByRole('link', { name: 'Räume', exact: true }).click();
    await alice.getByRole('link', { name: /20 Eisenplatte/ }).click();
    await expect(alice).toHaveURL(link);
    await expect(alice.locator('main.workspace')).toHaveAttribute(
      'data-ready',
      'true',
    );
    await alice.screenshot({
      path: test.info().outputPath('site-db-rooms-desktop.png'),
    });
    await alice.setViewportSize({ width: 390, height: 844 });
    await expect(
      alice.getByRole('button', { name: 'Teilen', exact: true }),
    ).toBeVisible();
    await alice.screenshot({
      path: test.info().outputPath('site-db-rooms-mobile.png'),
    });
    expect(errors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
  }
});
