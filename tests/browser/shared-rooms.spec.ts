import { test, expect } from '@playwright/test';
import { roomWireFixture } from './room-wire-fixture';
const base = process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173';
test('direct entry opens a single recent-room dialog with output labels', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'satispire.recent-rooms.v1',
      JSON.stringify([
        {
          roomId: '172be3fe-e426-46c2-84f4-765639fcebee',
          shareSecret: 'a'.repeat(64),
          label: '40 Iron Plate/min · 20 Iron Rod/min',
          visitedAt: 1,
        },
      ]),
    ),
  );
  await page.goto(base);
  const dialog = page.getByRole('dialog', { name: 'Deine Räume' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('link', { name: /40 Iron Plate/ })).toBeVisible();
  await expect(dialog).not.toContainText('172be3fe');
  await page.getByRole('button', { name: 'Neuen Raum starten' }).click();
  await expect(page.getByRole('alert')).toContainText('Online-Räume');
  await expect(page.getByRole('dialog')).toHaveCount(1);
});
test('a direct room link bypasses the entry dialog and reports unavailable backend truthfully', async ({
  page,
}) => {
  await page.goto(
    base + '/room/172be3fe-e426-46c2-84f4-765639fcebee#key=' + 'a'.repeat(64),
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Online-Räume');
  await expect(
    page.getByRole('button', { name: 'Erneut verbinden' }),
  ).toBeVisible();
});

test('creates the canonical shared room, synchronizes two browsers and undoes through history', async ({
  page,
  browser,
}) => {
  const fixture = roomWireFixture();
  await fixture.install(page);
  await page.goto(base);
  await page.getByRole('button', { name: 'Neuen Raum starten' }).click();
  const canonical =
    base + '/room/' + fixture.roomId + '#key=' + fixture.shareSecret;
  await expect(page).toHaveURL(canonical);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page.getByLabel('Raum-Link', { exact: true })).toHaveValue(
    canonical,
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const second = await browser.newContext();
  const other = await second.newPage();
  await fixture.install(other);
  await other.goto(canonical);
  await expect(other.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByLabel('Zielrate pro Minute', { exact: true }).fill('40');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(
    other.getByLabel('Zielrate pro Minute', { exact: true }),
  ).toHaveValue('40');
  await expect(
    page.getByRole('status').filter({ hasText: 'Verbunden' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Historie', exact: true }).click();
  await page
    .getByRole('button', { name: 'Änderung 1 rückgängig machen' })
    .click();
  await expect(
    other.getByLabel('Zielrate pro Minute', { exact: true }),
  ).toHaveValue('20');
  await expect(
    page.getByRole('complementary', { name: 'Änderungshistorie' }),
  ).toContainText('Rückgängig: Outputs');
  await page.getByRole('button', { name: 'Historie schließen' }).click();
  await page.getByRole('link', { name: 'Räume', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Deine Räume' })).toBeVisible();
  await page.getByRole('link', { name: /20 Iron Plate/ }).click();
  await expect(page).toHaveURL(canonical);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  expect(fixture.state().members).toBe(2);
  await page.screenshot({ path: test.info().outputPath('room-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('button', { name: 'Teilen', exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole('link', { name: 'Räume', exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: test.info().outputPath('room-mobile.png') });
  await second.close();
});

test('preserves a local draft during remote edits and never echoes incoming plans into history', async ({
  page,
}) => {
  const fixture = roomWireFixture();
  await fixture.install(page);
  await page.goto(
    base + '/room/' + fixture.roomId + '#key=' + fixture.shareSecret,
  );
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByLabel('Zielrate pro Minute', { exact: true }).fill('99');
  const next = fixture.state().plan;
  next.production.targets[0]!.rate = '40';
  fixture.remoteEdit(next);
  await expect(
    page.getByLabel('Zielrate pro Minute', { exact: true }),
  ).toHaveValue('99');
  await expect(page.locator('main.workspace')).toContainText('60 / min');
  expect(fixture.state().entries).toHaveLength(0);
});

test('saves rows and unlocks atomically and keeps personal navigation out of history', async ({
  page,
}) => {
  const fixture = roomWireFixture();
  await fixture.install(page);
  await page.goto(
    base + '/room/' + fixture.roomId + '#key=' + fixture.shareSecret,
  );
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByLabel('Reihen', { exact: true }).selectOption('2');
  await expect.poll(() => fixture.state().plan.layout.rows).toBe(2);
  await page.getByRole('button', { name: 'Technologie', exact: true }).click();
  await page.getByLabel('HUB-Tier').selectOption('4');
  await page
    .getByRole('button', { name: 'Profil anwenden', exact: true })
    .click();
  await expect.poll(() => fixture.state().plan.unlocks.hubTier).toBe(4);
  expect(fixture.state().revision).toBe(2);
  expect(fixture.state().plan.production.technology).toEqual(
    fixture.state().plan.unlocks.technology,
  );
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.5');
  expect(fixture.state().revision).toBe(2);
});

test('keeps share links usable when browser storage and clipboard are blocked', async ({
  page,
}) => {
  const fixture = roomWireFixture();
  await fixture.install(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw Error('blocked');
      },
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw Error('blocked');
        },
      },
    });
  });
  const canonical =
    base + '/room/' + fixture.roomId + '#key=' + fixture.shareSecret;
  await page.goto(canonical);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: 'Teilen', exact: true }).click();
  await expect(page.getByLabel('Raum-Link', { exact: true })).toHaveValue(
    canonical,
  );
  await expect(
    page.getByRole('status').filter({ hasText: 'Kopiere den Raum-Link' }),
  ).toBeVisible();
});

test('a draft based on an older revision cannot overwrite a collaborator edit', async ({
  page,
}) => {
  const fixture = roomWireFixture();
  await fixture.install(page);
  await page.goto(
    base + '/room/' + fixture.roomId + '#key=' + fixture.shareSecret,
  );
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByLabel('Zielrate pro Minute', { exact: true }).fill('99');
  const next = fixture.state().plan;
  next.production.targets[0]!.rate = '40';
  fixture.remoteEdit(next);
  await expect(page.locator('main.workspace')).toContainText('60 / min');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('inzwischen geändert');
  expect(fixture.state().plan.production.targets[0]!.rate).toBe('40');
  await expect(
    page.getByLabel('Zielrate pro Minute', { exact: true }),
  ).toHaveValue('99');
  await page
    .getByRole('button', { name: 'Aktuellen Stand übernehmen' })
    .click();
  await expect(
    page.getByLabel('Zielrate pro Minute', { exact: true }),
  ).toHaveValue('40');
});

test('cancels a delayed import cleanly when another participant changes the room', async ({
  page,
}) => {
  const fixture = roomWireFixture();
  await fixture.install(page);
  await page.goto(
    base + '/room/' + fixture.roomId + '#key=' + fixture.shareSecret,
  );
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      return original.call(this).then(
        (text) =>
          new Promise<string>((resolve) => {
            Object.assign(window, { finishRoomImport: () => resolve(text) });
          }),
      );
    };
  });
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'plan.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture.state().plan)),
  });
  await page.waitForFunction(() => 'finishRoomImport' in window);
  const next = fixture.state().plan;
  next.production.targets[0]!.rate = '40';
  fixture.remoteEdit(next);
  await expect(page.locator('main.workspace')).toContainText('60 / min');
  await page.evaluate(() => {
    (window as unknown as { finishRoomImport: () => void }).finishRoomImport();
  });
  await expect(
    page.getByRole('button', { name: 'Plan berechnen', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('Plan-Datei')).toBeEnabled();
  expect(fixture.state().plan.production.targets[0]!.rate).toBe('40');
});

test('preserves creator membership on initial navigation when browser storage is blocked', async ({
  page,
}) => {
  const fixture = roomWireFixture();
  await fixture.install(page);
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw Error('blocked');
      },
    }),
  );
  await page.goto(base);
  await page.getByRole('button', { name: 'Neuen Raum starten' }).click();
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page).toHaveURL(
    base + '/room/' + fixture.roomId + '#key=' + fixture.shareSecret,
  );
  expect(fixture.state().members).toBe(1);
});

test('recovers valid room links from corrupt membership using structured redacted errors', async ({
  page,
}) => {
  const fixture = roomWireFixture();
  await fixture.install(page);
  await page.addInitScript(
    ({ roomId }) =>
      localStorage.setItem(
        'satispire.membership.v1:' + roomId,
        JSON.stringify({
          roomId,
          participantId: 'old',
          capability: 'd'.repeat(64),
        }),
      ),
    { roomId: fixture.roomId },
  );
  await page.goto(
    base + '/room/' + fixture.roomId + '#key=' + fixture.shareSecret,
  );
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  expect(fixture.state().members).toBe(1);
});

test('loads older history pages and explains conflicting undo without changing the plan', async ({
  page,
}) => {
  const fixture = roomWireFixture();
  fixture.seedHistory(22);
  await fixture.install(page);
  await page.goto(
    base + '/room/' + fixture.roomId + '#key=' + fixture.shareSecret,
  );
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: 'Historie', exact: true }).click();
  const history = page.getByRole('complementary', {
    name: 'Änderungshistorie',
  });
  await expect(history.locator('li')).toHaveCount(20);
  await page.getByRole('button', { name: 'Ältere Änderungen laden' }).click();
  await expect(history.locator('li')).toHaveCount(22);
  await page
    .getByRole('button', { name: 'Änderung 1 rückgängig machen', exact: true })
    .click();
  await expect(history.getByRole('alert')).toContainText(
    'wegen späterer Änderungen',
  );
  expect(fixture.state().revision).toBe(22);
  expect(fixture.state().plan.production.targets[0]!.rate).toBe('42');
});
