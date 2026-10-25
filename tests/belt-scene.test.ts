import { expect, it } from 'vitest';
import { solveProduction } from '../src/domain/production.js';
import { generateSupplyLayout } from '../src/domain/supply-layout.js';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../src/domain/vanilla.js';
import { compareRouteQuality } from '../web/workspace/corridor-optimizer.js';
import { supplySceneMetrics } from '../web/workspace/supply-scene.js';
import {
  transportBodyHalf,
  transportPortRadius,
} from '../web/workspace/transport-symbol.js';

type Scene = ReturnType<typeof supplySceneMetrics>;
type Floor = ReturnType<typeof generateSupplyLayout>['floors'][number];
type Point = { x: number; y: number };
type Segment = { a: Point; b: Point };
type Box = Point & { width: number; height: number; name: string };
const epsilon = 0.000001;
const same = (a: number, b: number) => Math.abs(a - b) < epsilon;
const segments = (points: Point[]): Segment[] =>
  points.slice(1).map((b, index) => ({ a: points[index]!, b }));
const junction = (kind: string) =>
  ['splitter', 'merger', 'pipe-junction'].includes(kind);

/** Positive-length shared tracks hide a belt; perpendicular crossings do not. */
function sharedLength(first: Segment, second: Segment): number {
  if (
    same(first.a.x, first.b.x) &&
    same(second.a.x, second.b.x) &&
    same(first.a.x, second.a.x)
  )
    return (
      Math.min(
        Math.max(first.a.y, first.b.y),
        Math.max(second.a.y, second.b.y),
      ) -
      Math.max(Math.min(first.a.y, first.b.y), Math.min(second.a.y, second.b.y))
    );
  if (
    same(first.a.y, first.b.y) &&
    same(second.a.y, second.b.y) &&
    same(first.a.y, second.a.y)
  )
    return (
      Math.min(
        Math.max(first.a.x, first.b.x),
        Math.max(second.a.x, second.b.x),
      ) -
      Math.max(Math.min(first.a.x, first.b.x), Math.min(second.a.x, second.b.x))
    );
  return 0;
}

function entersInterior({ a, b }: Segment, box: Box): boolean {
  return same(a.x, b.x)
    ? a.x > box.x + epsilon &&
        a.x < box.x + box.width - epsilon &&
        Math.max(a.y, b.y) > box.y + epsilon &&
        Math.min(a.y, b.y) < box.y + box.height - epsilon
    : same(a.y, b.y) &&
        a.y > box.y + epsilon &&
        a.y < box.y + box.height - epsilon &&
        Math.max(a.x, b.x) > box.x + epsilon &&
        Math.min(a.x, b.x) < box.x + box.width - epsilon;
}

function verifyScene(scene: Scene, floor: Floor, description: string) {
  const obstacles: Box[] = [
    ...scene.labels.map((label, index) => ({
      ...label,
      name: `input card ${index}`,
    })),
    { ...scene.outputLabel, name: 'output card' },
    ...floor.machines.map((machine) => ({
      x: machine.x + scene.shift,
      y: machine.y + scene.shift,
      width: machine.width,
      height: machine.depth,
      name: `machine ${machine.id}`,
    })),
    ...scene.nodes
      .filter((node) => junction(node.kind))
      .map((node) => ({
        x: node.x - transportBodyHalf,
        y: node.y - transportBodyHalf,
        width: transportBodyHalf * 2,
        height: transportBodyHalf * 2,
        name: node.id,
      })),
  ];
  expect(scene.corridorOptimization.candidatesEvaluated).toBeLessThanOrEqual(6);
  expect(
    compareRouteQuality(
      scene.corridorOptimization.quality,
      scene.corridorOptimization.baselineQuality,
    ),
  ).toBeLessThanOrEqual(0);
  expect(scene.corridorViolations).toBe(0);
  if (scene.corridorOptimization.assignments)
    expect(
      compareRouteQuality(
        scene.corridorOptimization.quality,
        scene.corridorOptimization.baselineQuality,
      ),
    ).toBeLessThan(0);
  const faults: string[] = [];
  const routed = scene.belts.map((belt) => ({
    ...belt,
    segments: segments(belt.points),
  }));
  for (const belt of routed) {
    const prefix = `${description} ${belt.id}`;
    if (belt.points.length < 2) faults.push(`${prefix}: missing path`);
    for (let index = 0; index < belt.segments.length; index++) {
      const segment = belt.segments[index]!;
      if (!same(segment.a.x, segment.b.x) && !same(segment.a.y, segment.b.y))
        faults.push(`${prefix}: diagonal segment ${index}`);
      if (same(segment.a.x, segment.b.x) && same(segment.a.y, segment.b.y))
        faults.push(`${prefix}: zero-length segment ${index}`);
      for (const box of obstacles)
        if (entersInterior(segment, box))
          faults.push(`${prefix}: segment ${index} enters ${box.name}`);
      const next = belt.segments[index + 1];
      if (next) {
        const dot =
          (segment.b.x - segment.a.x) * (next.b.x - next.a.x) +
          (segment.b.y - segment.a.y) * (next.b.y - next.a.y);
        if (dot < -epsilon) faults.push(`${prefix}: immediate backtracking`);
      }
      for (const later of belt.segments.slice(index + 2))
        if (sharedLength(segment, later) > 0.05)
          faults.push(`${prefix}: retraces its own path`);
    }
    for (const [id, endpoint] of [
      [belt.from, belt.points[0]!],
      [belt.to, belt.points.at(-1)!],
    ] as const) {
      const node = scene.nodes.find((candidate) => candidate.id === id)!;
      const direction = scene.portSides.get(`${belt.id}:${id}`)!;
      const radius = junction(node.kind) ? transportPortRadius : 0;
      if (
        !same(endpoint.x, node.x + radius * direction.x) ||
        !same(endpoint.y, node.y + radius * direction.y)
      )
        faults.push(`${prefix}: detached endpoint at ${id}`);
    }
  }
  for (let index = 0; index < routed.length; index++) {
    const belt = routed[index]!;
    for (const other of routed.slice(index + 1))
      for (const first of belt.segments)
        for (const second of other.segments)
          if (sharedLength(first, second) > 0.05)
            faults.push(
              `${description}: ${belt.id} and ${other.id} share a track`,
            );
  }
  for (const node of scene.nodes.filter((candidate) =>
    junction(candidate.kind),
  )) {
    const directions = scene.belts
      .filter((belt) => belt.from === node.id || belt.to === node.id)
      .map((belt) => scene.portSides.get(`${belt.id}:${node.id}`)!)
      .map((direction) => `${direction.x},${direction.y}`);
    if (new Set(directions).size !== directions.length)
      faults.push(
        `${description}: multiple belts use the same port on ${node.id}`,
      );
  }
  expect(faults).toEqual([]);
  expect(scene.belts.map((belt) => belt.id).sort()).toEqual(
    floor.transport.edges.map((edge) => edge.id).sort(),
  );
}

const technology = { ...technologyAtTier(4), beltTier: 2 };
const productionInput = {
  recipes: availableChoices(technology),
  imports: vanillaCatalog.items
    .filter((item) => item.raw)
    .map((item) => item.id),
  technology,
};
const steelPlan = solveProduction(vanillaCatalog, {
  ...productionInput,
  targets: [
    { itemId: 'Desc_SteelPipe_C', rate: '20' },
    { itemId: 'Desc_SteelPlate_C', rate: '33/2' },
    { itemId: 'Desc_SteelPlateReinforced_C', rate: '12' },
  ],
});

it('keeps two constructor outputs separate on the approach to their shared merger', () => {
  const plan = solveProduction(vanillaCatalog, {
    ...productionInput,
    targets: [{ itemId: 'Desc_IronPlate_C', rate: '40' }],
  });
  const layout = generateSupplyLayout(vanillaCatalog, plan, technology, 2, {
    schemaVersion: 1,
    pattern: 'fixed',
    inputSide: 'west',
    outputSide: 'west',
    overrides: [],
  });
  const floor = layout.floors.find(
    (candidate) => candidate.itemId === 'Desc_IronPlate_C',
  )!;
  expect(floor.machineCount).toBe(2);
  const scene = supplySceneMetrics(layout, floor, vanillaCatalog, technology);
  const merger = scene.nodes.find((node) => node.kind === 'merger')!;
  expect(scene.belts.filter((belt) => belt.to === merger.id)).toHaveLength(2);
  verifyScene(scene, floor, 'two constructors west/west');
});

it('connects owned machine branches directly and avoids inlet micro-jogs', () => {
  const layout = generateSupplyLayout(vanillaCatalog, steelPlan, technology, 2);
  const floor = layout.floors.find(
    (candidate) => candidate.itemId === 'Desc_SteelPlate_C',
  )!;
  const scene = supplySceneMetrics(layout, floor, vanillaCatalog, technology);
  for (const node of scene.nodes.filter(
    (candidate) =>
      junction(candidate.kind) && candidate.machineId !== undefined,
  )) {
    const branch = scene.belts.find((belt) => {
      const other = scene.nodes.find(
        (candidate) =>
          candidate.id === (belt.from === node.id ? belt.to : belt.from),
      );
      return (
        (belt.from === node.id || belt.to === node.id) &&
        other?.placement === 'port' &&
        other.machineId === node.machineId
      );
    });
    if (!branch) continue;
    expect(scene.portSides.get(`${branch.id}:${node.id}`)).toEqual({
      x: 0,
      y: node.flow === 'input' ? 1 : -1,
    });
    expect(branch.points).toHaveLength(2);
  }
  const inlet = scene.nodes.find((node) => node.kind === 'inlet')!;
  expect(
    scene.belts.find((belt) => belt.from === inlet.id)!.points.length,
  ).toBe(2);
});

it.each([false, true])(
  'draws both Mk.2 steel inlet belts and preserves their actual endpoints (compact=%s)',
  (compact) => {
    const layout = generateSupplyLayout(
      vanillaCatalog,
      steelPlan,
      technology,
      2,
    );
    const floor = layout.floors.find(
      (candidate) => candidate.itemId === 'Desc_SteelPlate_C',
    )!;
    const scene = supplySceneMetrics(
      layout,
      floor,
      vanillaCatalog,
      technology,
      compact,
    );
    const inlets = scene.nodes.filter((node) => node.kind === 'inlet');
    const initial = scene.belts.filter((belt) =>
      inlets.some((node) => node.id === belt.from),
    );
    expect(inlets).toHaveLength(2);
    expect(initial).toHaveLength(2);
    expect(
      initial.every(
        (belt) => belt.itemId === 'Desc_SteelIngot_C' && belt.rate === '105',
      ),
    ).toBe(true);
    expect(
      Math.abs(initial[0]!.points[0]!.y - initial[1]!.points[0]!.y),
    ).toBeGreaterThan(2.9);
    expect(
      scene.nodes.filter(
        (node) => node.flow === 'input' && node.kind === 'splitter',
      ),
    ).toHaveLength(2);
    verifyScene(scene, floor, `steel inlet compact=${compact}`);
  },
);

it('routes uneven rows and every side combination without hidden belts or symbol intersections', () => {
  const sides = ['west', 'east', 'north', 'south'];
  let verified = 0;
  for (const rows of [1, 2, 3])
    for (const inputSide of sides)
      for (const outputSide of sides) {
        const layout = generateSupplyLayout(
          vanillaCatalog,
          steelPlan,
          technology,
          rows,
          {
            schemaVersion: 1,
            pattern: 'fixed',
            inputSide,
            outputSide,
            overrides: [],
          },
        );
        for (const compact of [false, true])
          for (const floor of layout.floors) {
            const scene = supplySceneMetrics(
              layout,
              floor,
              vanillaCatalog,
              technology,
              compact,
            );
            verifyScene(
              scene,
              floor,
              `${floor.itemId} rows=${rows} ${inputSide}/${outputSide} compact=${compact}`,
            );
            verified++;
          }
      }
  expect(verified).toBe(480);
}, 20_000);

it('keeps an already separated steel-beam scene and improves the measured encased-beam scene', () => {
  const layout = generateSupplyLayout(vanillaCatalog, steelPlan, technology, 2);
  const beamFloor = layout.floors.find(
    (floor) => floor.itemId === 'Desc_SteelPlate_C',
  )!;
  const beam = supplySceneMetrics(
    layout,
    beamFloor,
    vanillaCatalog,
    technology,
  );
  expect(beamFloor.rowCounts).toEqual([2, 2]);
  expect(beam.corridorOptimization.assignments).toBeNull();
  expect(beam.corridorOptimization.quality.crossings).toBe(0);
  const floor = layout.floors.find(
    (candidate) => candidate.itemId === 'Desc_SteelPlateReinforced_C',
  )!;
  const scene = supplySceneMetrics(layout, floor, vanillaCatalog, technology);
  expect(scene.corridorOptimization.baselineQuality.crossings).toBe(6);
  expect(scene.corridorOptimization.quality.crossings).toBe(3);
  expect(scene.corridorOptimization.assignments).not.toBeNull();
  verifyScene(scene, floor, 'optimized encased beam');
  const machines = new Map(
    floor.machines.map((machine) => [machine.id, machine]),
  );
  for (const belt of scene.belts) {
    const from = scene.nodes.find((node) => node.id === belt.from)!;
    const to = scene.nodes.find((node) => node.id === belt.to)!;
    const source = machines.get(from.machineId!);
    const target = machines.get(to.machineId!);
    if (!source || !target || source.row === target.row) continue;
    const assignment = scene.corridorOptimization.assignments!.find(
      (bundle) => bundle.id === `${belt.flow}:${belt.itemId}`,
    )!;
    const spine = assignment.tracks[from.lane]!;
    const gap =
      (Math.min(source.y, target.y) +
        source.depth +
        Math.max(source.y, target.y)) /
        2 +
      scene.shift;
    expect(
      segments(belt.points).some(
        ({ a, b }) =>
          same(a.x, spine) &&
          same(b.x, spine) &&
          Math.min(a.y, b.y) <= gap &&
          Math.max(a.y, b.y) >= gap,
      ),
    ).toBe(true);
  }
});
