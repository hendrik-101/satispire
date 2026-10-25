import { transportPortRadius } from '../web/workspace/transport-symbol.js';
import { generateSupplyLayout } from '../src/domain/supply-layout.js';
import { solveProduction } from '../src/domain/production.js';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../src/domain/vanilla.js';
import { supplySceneMetrics } from '../web/workspace/supply-scene.js';
import { expect, it } from 'vitest';
import {
  placeBeltLoadLabels,
  type LoadLabelBelt,
} from '../web/workspace/belt-load-labels.js';
const belt = (
  id: string,
  points: LoadLabelBelt['points'],
  rate = '105/2',
): LoadLabelBelt => ({
  id,
  points,
  rate,
  capacity: '120',
  itemId: 'steel',
  transport: 'belt',
  tier: 2,
});

it('shows the actual collector load and compares capacity exactly', () => {
  const labels = placeBeltLoadLabels(
    [
      belt('collector', [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ]),
      belt(
        'input',
        [
          { x: 0, y: 10 },
          { x: 20, y: 10 },
        ],
        '105',
      ),
      belt(
        'equal',
        [
          { x: 0, y: 20 },
          { x: 20, y: 20 },
        ],
        '120',
      ),
      belt(
        'exceeded',
        [
          { x: 0, y: 30 },
          { x: 20, y: 30 },
        ],
        '120000000000000000001/1000000000000000000',
      ),
    ],
    [],
  );
  expect(labels.map((l) => [l.text, l.overloaded])).toEqual([
    ['52,5/min', false],
    ['105/min', false],
    ['120/min', false],
    ['≈ 120/min', true],
  ]);
});

it('places beside alternate segments without covering obstacles, routes or labels', () => {
  const belts = [
    belt('horizontal', [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ]),
    belt('vertical', [
      { x: 15, y: -10 },
      { x: 15, y: 10 },
    ]),
    belt('short', [
      { x: 35, y: 0 },
      { x: 36, y: 0 },
    ]),
  ];
  const obstacles = [{ x: 8, y: -5, width: 14, height: 4 }];
  const before = JSON.stringify({ belts, obstacles });
  const labels = placeBeltLoadLabels(belts, obstacles);
  expect(labels).toHaveLength(3);
  const overlaps = (
    a: (typeof labels)[number],
    b: { x: number; y: number; width: number; height: number },
  ) =>
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
  for (const [i, label] of labels.entries()) {
    expect(obstacles.some((o) => overlaps(label, o))).toBe(false);
    expect(labels.slice(i + 1).some((other) => overlaps(label, other))).toBe(
      false,
    );
    for (const b of belts) {
      const [a, end] = b.points;
      if (a!.y === end!.y) {
        expect(
          a!.y >= label.y &&
            a!.y <= label.y + label.height &&
            Math.max(a!.x, end!.x) >= label.x &&
            Math.min(a!.x, end!.x) <= label.x + label.width,
        ).toBe(false);
      } else {
        expect(
          a!.x >= label.x &&
            a!.x <= label.x + label.width &&
            Math.max(a!.y, end!.y) >= label.y &&
            Math.min(a!.y, end!.y) <= label.y + label.height,
        ).toBe(false);
      }
    }
  }
  expect(JSON.stringify({ belts, obstacles })).toBe(before);
});

it('retains pipe units and skips genuinely enclosed routes', () => {
  const pipe = {
    ...belt('pipe', [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]),
    transport: 'pipe' as const,
  };
  expect(placeBeltLoadLabels([pipe], [])[0]!.text).toBe('52,5 m³/min');
  expect(
    placeBeltLoadLabels(
      [pipe],
      [{ x: -100, y: -100, width: 200, height: 200 }],
    ),
  ).toEqual([]);
});

it('accepts computed canonical rates beyond the user-input digit limit', () => {
  const huge = '1' + '0'.repeat(70);
  const labels = placeBeltLoadLabels(
    [
      {
        ...belt(
          'large',
          [
            { x: 0, y: 0 },
            { x: 200, y: 0 },
          ],
          huge,
        ),
        capacity: huge,
      },
    ],
    [],
  );
  expect(labels).toHaveLength(1);
  expect(labels[0]!.overloaded).toBe(false);
});

it('labels all fifteen steel beam belts with readable boxes clear of symbols and routes', () => {
  const technology = { ...technologyAtTier(4), beltTier: 2 };
  const plan = solveProduction(vanillaCatalog, {
    targets: [
      { itemId: 'Desc_SteelPipe_C', rate: '20' },
      { itemId: 'Desc_SteelPlate_C', rate: '33/2' },
      { itemId: 'Desc_SteelPlateReinforced_C', rate: '12' },
    ],
    recipes: availableChoices(technology),
    imports: vanillaCatalog.items
      .filter((item) => item.raw)
      .map((item) => item.id),
    technology,
  });
  const layout = generateSupplyLayout(vanillaCatalog, plan, technology, 2);
  const floor = layout.floors.find((f) => f.itemId === 'Desc_SteelPlate_C')!;
  const scene = supplySceneMetrics(layout, floor, vanillaCatalog, technology);
  expect(scene.belts).toHaveLength(15);
  expect(scene.loadLabels).toHaveLength(15);
  const boxes = [
    ...scene.labels,
    scene.outputLabel,
    ...floor.machines.map((m) => ({
      x: m.x + scene.shift,
      y: m.y + scene.shift,
      width: m.width,
      height: m.depth,
    })),
    ...scene.nodes
      .filter((n) => ['splitter', 'merger', 'pipe-junction'].includes(n.kind))
      .map((n) => ({
        x: n.x - transportPortRadius - 0.1,
        y: n.y - transportPortRadius - 0.1,
        width: (transportPortRadius + 0.1) * 2,
        height: (transportPortRadius + 0.1) * 2,
      })),
  ];
  for (const [index, label] of scene.loadLabels.entries()) {
    expect(label.height).toBe(2.4);
    expect(label.width).toBeGreaterThanOrEqual(label.text.length * 0.96);
    for (const box of [...boxes, ...scene.loadLabels.slice(index + 1)]) {
      expect(
        label.x < box.x + box.width &&
          label.x + label.width > box.x &&
          label.y < box.y + box.height &&
          label.y + label.height > box.y,
      ).toBe(false);
    }
    for (const belt of scene.belts)
      for (let i = 1; i < belt.points.length; i++) {
        const a = belt.points[i - 1]!,
          b = belt.points[i]!;
        expect(a.x === b.x || a.y === b.y).toBe(true);
        const intersects =
          a.y === b.y
            ? a.y >= label.y &&
              a.y <= label.y + label.height &&
              Math.max(a.x, b.x) >= label.x &&
              Math.min(a.x, b.x) <= label.x + label.width
            : a.x >= label.x &&
              a.x <= label.x + label.width &&
              Math.max(a.y, b.y) >= label.y &&
              Math.min(a.y, b.y) <= label.y + label.height;
        expect(intersects, label.beltId).toBe(false);
      }
  }
});
