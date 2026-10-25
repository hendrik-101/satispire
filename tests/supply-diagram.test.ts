import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { solveProduction } from '../src/domain/production.js';
import { generateSupplyLayout } from '../src/domain/supply-layout.js';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../src/domain/vanilla.js';
import { SupplyDiagram } from '../web/workspace/SupplyDiagram.js';
import { MachineGlyph } from '../web/workspace/MachineGlyph.js';
import { FoundationGrid } from '../web/workspace/FoundationGrid.js';
import { flowDescription } from '../web/workspace/supply-scene.js';

const technology = { ...technologyAtTier(4), beltTier: 2 };
const plan = solveProduction(vanillaCatalog, {
  targets: [
    { itemId: 'Desc_SteelPipe_C', rate: '20' },
    { itemId: 'Desc_SteelPlate_C', rate: '33/2' },
    { itemId: 'Desc_SteelPlateReinforced_C', rate: '12' },
  ],
  recipes: availableChoices(technology),
  imports: vanillaCatalog.items.filter((i) => i.raw).map((i) => i.id),
  technology,
});
const layout = generateSupplyLayout(vanillaCatalog, plan, technology, 2);
const render = (floor: (typeof layout.floors)[number]) =>
  renderToStaticMarkup(
    createElement(SupplyDiagram, {
      layout,
      floor,
      marker: 'test',
      catalog: vanillaCatalog,
      technology,
    }),
  );

test('steel feed labels show throughput, belt tier and per-belt capacity', () => {
  const floor = layout.floors.find((f) => f.itemId === 'Desc_SteelPlate_C')!;
  const markup = render(floor);
  expect(markup).toContain('210 Stk./min');
  expect(markup).toContain('2 Bänder Mk.2');
  expect(markup).toContain('je 120 Stk./min');
  expect(markup).toContain('52,5 Stk./min');
  expect(markup).not.toContain('× OUT');
});

test('floor references only represent transfers connected to the selected floor', () => {
  for (const floor of layout.floors) {
    const markup = render(floor);
    for (const transfer of layout.transfers) {
      const incident =
        transfer.fromFloor === floor.index || transfer.toFloor === floor.index;
      expect(
        markup.includes(`data-transfer-id="${transfer.id}"`),
        `${floor.itemId}: ${transfer.id}`,
      ).toBe(incident);
    }
  }
});

test('each feed has a separate, resource-specific intake', () => {
  const floor = layout.floors.find((f) => f.inputs.length > 1)!;
  const markup = render(floor);
  for (const feed of floor.inputs) {
    expect(markup).toContain(`data-intake-resource="${feed.itemId}"`);
  }
  expect(markup).toContain('data-flow-labels');
});

test('machine symbols put their inlet and outlet on the short edges', () => {
  const markup = renderToStaticMarkup(
    createElement(MachineGlyph, { machineId: 'Desc_ConstructorMk1_C' }),
  );
  expect(markup).toContain('viewBox="0 0 80 100"');
  expect(markup).toContain('y="90"');
});

test('fluid labels use cubic meters and pipe capacity rather than belt units', () => {
  const item = vanillaCatalog.items.find((i) => i.transport === 'pipe')!;
  expect(
    flowDescription(
      vanillaCatalog,
      { ...technology, pipeTier: 2 },
      { itemId: item.id, rate: '900', lines: 2 },
    ),
  ).toMatchObject({
    rate: '900 m³/min',
    transport: '2 Rohre Mk.2 · je 600 m³/min',
  });
});

test('foundation subdivisions follow zoom while retaining their world origin', () => {
  const renderGrid = (pixelsPerUnit: number) =>
    renderToStaticMarkup(
      createElement(FoundationGrid, {
        id: 'grid',
        x: 7,
        y: -3,
        width: 100,
        height: 80,
        pixelsPerUnit,
      }),
    );
  expect(renderGrid(4)).toContain('data-grid-step="8"');
  expect(renderGrid(4)).not.toContain('data-grid-step="0.5"');
  expect(renderGrid(16)).toContain('data-grid-step="0.5"');
  expect(renderGrid(16)).toContain('patternUnits="userSpaceOnUse" x="0" y="0"');
});

test('reserved shafts keep their shared coordinates and identify material across their span', () => {
  for (const floor of layout.floors) {
    const markup = render(floor);
    for (const transfer of layout.transfers) {
      if (!transfer.span.includes(floor.index)) continue;
      expect(markup).toContain(`data-shaft-id="${transfer.id}"`);
      expect(markup).toContain(
        `transform="translate(${transfer.x + 17} ${transfer.y + 17})"`,
      );
      expect(markup).toContain(
        `Etage ${transfer.fromFloor + 1} → Etage ${transfer.toFloor + 1}`,
      );
    }
    expect(markup).toContain(
      `width="${layout.footprint.width}" height="${layout.footprint.depth}"`,
    );
  }
});

test('shaft references connect incident cards without becoming counted belts', () => {
  for (const floor of layout.floors) {
    const markup = render(floor);
    const references = markup.match(/data-shaft-reference=/g) ?? [];
    expect(references).toHaveLength(
      layout.transfers.filter(
        (transfer) =>
          transfer.fromFloor === floor.index ||
          transfer.toFloor === floor.index,
      ).length,
    );
  }
});
