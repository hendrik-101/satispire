import { expect, test, type Page } from '@playwright/test';
import { vanillaCatalog, technologyAtTier } from '../../src/domain/vanilla.js';
const url =
  (process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173') + '/local';
async function ready(page: Page) {
  await page.goto(url);
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  // These canvas scenarios explicitly exercise the target's machines.
  await page
    .getByLabel('Stufe auswählen', { exact: true })
    .selectOption('Desc_IronPlate_C');
}
test('mobile variant controls remain inside the floor for a Particle Accelerator', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByLabel('Plan-Datei').setInputFiles({
    name: 'diamonds.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: vanillaCatalog.catalogVersion,
        production: {
          targets: [{ itemId: 'Desc_Diamond_C', rate: '30' }],
          recipes: { Desc_Diamond_C: 'Recipe_Diamond_C' },
          imports: ['Desc_Coal_C'],
          technology: technologyAtTier(9),
        },
      }),
    ),
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.canvas-heading h2')).toHaveText(
    'Teilchenbeschleuniger',
  );
  await page.locator('.variant-control summary').click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const contained = await page
      .locator('.variant-popover')
      .evaluate((panel) => {
        const floor = panel.closest('.floor-panel')!.getBoundingClientRect();
        return [panel, ...panel.querySelectorAll('select,input')].every(
          (node) => {
            const box = node.getBoundingClientRect();
            return (
              box.left >= floor.left &&
              box.right <= floor.right &&
              box.top >= floor.top &&
              box.bottom <= floor.bottom
            );
          },
        );
      });
    expect(contained, `all controls inside the floor at ${width}px`).toBe(true);
  }
  await page.getByLabel('Eingangsseite').selectOption('north');
  await expect(page.getByTestId('floor-scene')).toHaveAttribute(
    'data-input-side',
    'north',
  );
  await page.screenshot({
    path: test.info().outputPath('mobile-particle-variants.png'),
    fullPage: true,
  });
});
for (const side of ['north-output', 'south-input'] as const) {
  test(`${side} multi-row manifold arrow points toward the north`, async ({
    page,
  }) => {
    await ready(page);
    await page.getByLabel('Zielrate pro Minute').fill('240');
    await page
      .getByRole('button', { name: 'Plan berechnen', exact: true })
      .click();
    await page.getByLabel('Reihen', { exact: true }).selectOption('3');
    await page.locator('.variant-control summary').click();
    await page.getByLabel('Nur diese Etage').check();
    await page
      .getByLabel(side === 'north-output' ? 'Ausgangsseite' : 'Eingangsseite')
      .selectOption(side === 'north-output' ? 'north' : 'south');
    const directions = await page
      .getByTestId('floor-scene')
      .evaluate((svg, out) => {
        const terminals = Array.from(svg.querySelectorAll('[data-kind]'))
          .filter(
            (node) =>
              node.getAttribute('data-kind') === (out ? 'outlet' : 'inlet'),
          )
          .map((node) => node.getAttribute('data-transport-node'));
        return Array.from(svg.querySelectorAll<SVGGElement>('.supply-belt'))
          .filter((belt) =>
            terminals.includes(
              belt.getAttribute(out ? 'data-edge-to' : 'data-edge-from'),
            ),
          )
          .map(
            (belt) => belt.querySelector<SVGPathElement>('.supply-belt-edge')!,
          )
          .map((p) => {
            const start = p.getPointAtLength(0),
              end = p.getPointAtLength(p.getTotalLength());
            const machinePorts = Array.from(
              svg.querySelectorAll<SVGPathElement>(
                out
                  ? '.supply-belt[data-machine-output] .supply-belt-edge'
                  : '.supply-belt[data-machine-input] .supply-belt-edge',
              ),
            ).map(
              (path) =>
                path.getPointAtLength(out ? 0 : path.getTotalLength()).y,
            );
            const machineY = out
              ? Math.min(...machinePorts)
              : Math.max(...machinePorts);
            const reference = p.getAttribute('marker-end')!;
            const marker = document.getElementById(reference.slice(5, -1));
            return {
              dx: end.x - start.x,
              dy: out ? end.y - machineY : machineY - start.y,
              color: p.getAttribute('stroke'),
              markerColor: marker?.querySelector('path')?.getAttribute('fill'),
            };
          });
      }, side === 'north-output');
    expect(directions.length).toBeGreaterThan(0);
    for (const direction of directions) {
      expect(direction.color).toBeTruthy();
      expect(direction.markerColor).toBe(direction.color);
      expect(direction.dy).toBeLessThan(0);
    }
    await page.locator('.variant-control summary').click();
    await page.screenshot({
      path: test.info().outputPath(`${side}.png`),
      fullPage: true,
    });
  });
}
