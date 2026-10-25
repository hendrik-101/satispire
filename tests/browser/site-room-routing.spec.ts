import { expect, test } from '@playwright/test';
import { roomWireFixture } from './room-wire-fixture';
const base = process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173';
test.skip(
  process.env.SATISPIRE_TEST_ONLINE !== '1',
  'Runs against the built Site/HTTP transport',
);
test('direct room URLs and reloads use the requested room instead of the exported shell ID', async ({
  page,
}) => {
  const fixture = roomWireFixture();
  await fixture.install(page);
  const link = base + '/room/' + fixture.roomId + '#key=' + fixture.shareSecret;
  await page.goto(link);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page.getByLabel('Raum-Link', { exact: true })).toHaveValue(link);
  await page.reload();
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page.getByLabel('Raum-Link', { exact: true })).toHaveValue(link);
  expect(fixture.state().members).toBe(1);
});
