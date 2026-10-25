import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const url =
  (process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173') + '/session';
test.skip(
  process.env.SATISPIRE_TEST_ONLINE !== '1',
  'Requires a running Convex deployment and VITE_CONVEX_URL',
);
async function ready(page: Page, link = url) {
  await page.goto(link);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page.getByLabel('Sitzungsstatus')).toHaveText('Gespeichert');
}
async function rate(page: Page, value: string) {
  await page.getByLabel('Zielrate pro Minute', { exact: true }).fill(value);
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByLabel('Sitzungsstatus')).toHaveText('Gespeichert');
}

test('a reusable session URL joins separate browsers, shares plans and restores after reload', async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const alice = await first.newPage();
    const bob = await second.newPage();
    await ready(alice);
    const link = alice.url();
    await ready(bob, link);
    await bob
      .getByLabel('Stufe auswählen', { exact: true })
      .selectOption('Desc_IronPlate_C');
    await rate(alice, '75');
    await expect(
      bob.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('75');
    await bob.reload();
    await expect(
      bob.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('75');
    expect(bob.url()).toBe(link);
    await bob
      .getByLabel('Stufe auswählen', { exact: true })
      .selectOption('Desc_IronPlate_C');
    await bob.getByLabel('Zielrate pro Minute', { exact: true }).fill('99');
    await rate(alice, '60');
    await expect(
      bob.getByText('60 / min', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      bob.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('99');
    await rate(bob, '90');
    await expect(
      alice.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('90');
    await alice.reload();
    await expect(
      alice.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('90');
    await rate(alice, '75');
    await expect(
      bob.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('75');
    await alice.reload();
    await expect(
      alice.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('75');
    await test.step('existing root session links restore the same HTTP session', async () => {
      const rootLink = new URL(alice.url());
      rootLink.pathname = '/';
      await ready(alice, rootLink.href);
      await expect(
        alice.getByLabel('Zielrate pro Minute', { exact: true }),
      ).toHaveValue('75');
      await expect(
        alice.getByRole('dialog', { name: 'Deine Räume' }),
      ).toHaveCount(0);
    });
  } finally {
    await first.close();
    await second.close();
  }
});

test('remote cursors use diagram coordinates, are scoped to floors and clear on pointer leave', async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const alice = await first.newPage();
    const bob = await second.newPage();
    await ready(alice);
    await ready(bob, alice.url());
    for (const page of [alice, bob])
      await page
        .getByLabel('Stufe auswählen', { exact: true })
        .selectOption('Desc_IronPlate_C');
    await bob.getByRole('button', { name: 'Vergrößern', exact: true }).click();
    const drawing = alice.getByRole('group', {
      name: 'Blockschema Eisenplatte',
      exact: true,
    });
    const bounds = (await drawing.boundingBox())!;
    const pointer = {
      x: bounds.x + bounds.width * 0.65,
      y: bounds.y + bounds.height * 0.5,
    };
    const world = await drawing.evaluate((element, point) => {
      const svg = element as SVGSVGElement;
      const p = svg.createSVGPoint();
      p.x = point.x;
      p.y = point.y;
      const mapped = p.matrixTransform(svg.getScreenCTM()!.inverse());
      return { x: mapped.x, y: mapped.y };
    }, pointer);
    await alice.mouse.move(pointer.x, pointer.y);
    const cursor = bob.locator('.remote-cursors-svg > g');
    await expect(cursor).toHaveCount(1);
    const transform = (await cursor.getAttribute('transform'))!.match(
      /translate\(([-\d.e]+) ([-\d.e]+)\)/,
    )!;
    expect(Number(transform[1])).toBeCloseTo(world.x, 2);
    expect(Number(transform[2])).toBeCloseTo(world.y, 2);
    await bob
      .getByLabel('Stufe auswählen', { exact: true })
      .selectOption('Desc_IronIngot_C');
    await expect(cursor).toHaveCount(0);
    await bob
      .getByLabel('Stufe auswählen', { exact: true })
      .selectOption('Desc_IronPlate_C');
    await expect(cursor).toHaveCount(1);
    await alice.mouse.move(2, 2);
    await expect(cursor).toHaveCount(0);
  } finally {
    await first.close();
    await second.close();
  }
});

test('an earlier plan can be saved again after another participant changes it', async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const alice = await first.newPage();
    const bob = await second.newPage();
    await ready(alice);
    await ready(bob, alice.url());
    await rate(alice, '75');
    await expect(
      bob.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('75');
    await rate(bob, '60');
    await expect(
      alice.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('60');
    await rate(alice, '75');
    await expect(
      bob.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('75');
    await alice.reload();
    await expect(
      alice.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('75');
  } finally {
    await first.close();
    await second.close();
  }
});

test('uncalculated targets and sizing drafts survive remote updates; export resumes synchronization', async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const alice = await first.newPage();
    const bob = await second.newPage();
    await ready(alice);
    await ready(bob, alice.url());
    await bob
      .getByLabel('Stufe auswählen', { exact: true })
      .selectOption('Desc_IronPlate_C');
    await bob
      .getByRole('button', { name: 'Ziel hinzufügen', exact: true })
      .click();
    await rate(alice, '30');
    await expect(bob.locator('.canvas-summary')).toContainText('30 / min');
    await expect(
      bob.getByLabel('Zielrate pro Minute 2', { exact: true }),
    ).toHaveValue('20');
    await bob
      .getByLabel('Produktionsziel 2', { exact: true })
      .selectOption('Desc_IronRod_C');
    await bob.getByLabel('Zielrate pro Minute 2', { exact: true }).fill('5');
    await bob.getByLabel('Berechnungsmodus').selectOption('input');
    await bob
      .getByLabel('Skalierungsbezug')
      .selectOption('stage:Desc_IronPlate_C');
    await bob
      .getByLabel('Verfügbares Material', { exact: true })
      .selectOption('Desc_IronIngot_C');
    await bob.getByLabel('Eingangsmenge pro Minute').fill('90');
    await rate(alice, '35');
    await expect(bob.locator('.canvas-summary')).toContainText('35 / min');
    await expect(bob.getByLabel('Berechnungsmodus')).toHaveValue('input');
    await expect(bob.getByLabel('Skalierungsbezug')).toHaveValue(
      'stage:Desc_IronPlate_C',
    );
    await expect(bob.getByLabel('Eingangsmenge pro Minute')).toHaveValue('90');
    await expect(
      bob.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('20');
    await expect(
      bob.getByLabel('Zielrate pro Minute 2', { exact: true }),
    ).toHaveValue('5');
    const download = bob.waitForEvent('download');
    await bob
      .getByRole('button', { name: 'Plan exportieren', exact: true })
      .click();
    const exported = JSON.parse(
      await readFile((await (await download).path())!, 'utf8'),
    );
    expect(exported.production.targets).toEqual([
      { itemId: 'Desc_IronPlate_C', rate: '60' },
      { itemId: 'Desc_IronRod_C', rate: '15' },
    ]);
    await expect(
      alice.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('60');
    await expect(
      alice.getByLabel('Zielrate pro Minute 2', { exact: true }),
    ).toHaveValue('15');
    await rate(alice, '42,5');
    await expect(
      bob.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('42,5');
    await expect(bob.getByLabel('Berechnungsmodus')).toHaveValue('target');
    await bob.reload();
    await expect(bob.locator('main.workspace')).toHaveAttribute(
      'data-ready',
      'true',
    );
    await expect(
      bob.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('42,5');
    await expect(
      bob.getByLabel('Zielrate pro Minute 2', { exact: true }),
    ).toHaveValue('15');
  } finally {
    await first.close();
    await second.close();
  }
});

test('a temporary HTTP save failure recovers without reloading or losing the result', async ({
  browser,
}) => {
  test.skip(
    Boolean(process.env.VITE_CONVEX_URL),
    'Site HTTP transport acceptance',
  );
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const alice = await first.newPage();
    const bob = await second.newPage();
    await ready(alice);
    await ready(bob, alice.url());
    let failed = false;
    await alice.route('**/api/sessions/commit', async (route) => {
      if (!failed) {
        failed = true;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'temporarily-unavailable' } }),
        });
      } else await route.continue();
    });
    await rate(alice, '75');
    expect(failed).toBe(true);
    await expect(
      bob.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('75');
    await rate(alice, '90');
    await expect(
      bob.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('90');
    await alice.reload();
    await expect(
      alice.getByLabel('Zielrate pro Minute', { exact: true }),
    ).toHaveValue('90');
  } finally {
    await first.close();
    await second.close();
  }
});
