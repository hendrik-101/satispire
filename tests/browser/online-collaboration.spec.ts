import { expect, test, type Page } from '@playwright/test';
const url = process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173';
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
  await expect(page.getByLabel('Session-Status')).toHaveText('Gespeichert');
}
async function rate(page: Page, value: string) {
  await page.getByLabel('Zielrate pro Minute', { exact: true }).fill(value);
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByLabel('Session-Status')).toHaveText('Gespeichert');
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
      name: 'Blockschema Iron Plate',
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

test('adding an uncalculated target survives a remote plan update', async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const alice = await first.newPage();
    const bob = await second.newPage();
    await ready(alice);
    await ready(bob, alice.url());
    await bob.locator('.target-editor summary').click();
    await bob
      .getByRole('button', { name: 'Ziel hinzufügen', exact: true })
      .click();
    await expect(
      bob.getByLabel('Produktionsziel 2', { exact: true }),
    ).toBeVisible();
    await rate(alice, '35');
    await expect(
      bob.getByLabel('Produktionsziel 2', { exact: true }),
    ).toBeVisible();
    await expect(
      bob.getByLabel('Zielrate pro Minute 2', { exact: true }),
    ).toHaveValue('20');
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
