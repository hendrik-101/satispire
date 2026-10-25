import { expect, it } from 'vitest';
import {
  compareRouteQuality,
  measureRouteQuality,
  optimizeCorridors,
  type CorridorAssignment,
  type CorridorBundle,
} from '../web/workspace/corridor-optimizer.js';

const machines = [
  { x: 0, y: 0, width: 8, height: 10 },
  { x: 24, y: 0, width: 8, height: 10 },
];
const bundles: CorridorBundle[] = [
  { id: 'first', lanes: 2, preferredSide: 'west', terminals: [{ x: 8, y: 3 }] },
  {
    id: 'second',
    lanes: 2,
    preferredSide: 'east',
    terminals: [{ x: 24, y: 7 }],
  },
];
const route = (id: string, resourceId: string, points: [number, number][]) => ({
  id,
  resourceId,
  points: points.map(([x, y]) => ({ x, y })),
});
const empty = { value: 'baseline', routes: [] };

it('measures crossing, overlap, fragmentation and obstacle violations geometrically', () => {
  const crossing = measureRouteQuality([
    route('a', 'alpha', [
      [0, 5],
      [10, 5],
    ]),
    route('b', 'beta', [
      [5, 0],
      [5, 10],
    ]),
  ]);
  expect(crossing.crossings).toBe(1);
  expect(
    measureRouteQuality([
      route('a', 'alpha', [
        [0, 0],
        [0, 10],
      ]),
      route('b', 'beta', [
        [2, 0],
        [2, 10],
      ]),
      route('c', 'alpha', [
        [4, 0],
        [4, 10],
      ]),
    ]).mixing,
  ).toBeGreaterThan(0);
  expect(
    measureRouteQuality([
      route('a', 'alpha', [
        [0, 0],
        [0, 10],
      ]),
      route('b', 'beta', [
        [0, 5],
        [0, 15],
      ]),
    ]).overlaps,
  ).toBe(1);
  const blocked = measureRouteQuality(
    [
      route('a', 'alpha', [
        [0, 5],
        [10, 5],
      ]),
    ],
    [{ x: 4, y: 4, width: 2, height: 2 }],
  );
  expect(blocked.invalid).toBe(1);
  expect(compareRouteQuality(blocked, crossing)).toBeGreaterThan(0);
  expect(
    measureRouteQuality([
      route('a', 'alpha', [
        [0, 0],
        [1, 1],
      ]),
    ]).invalid,
  ).toBe(1);
});

it('routes bounded alternatives with contiguous bundles in free interior and exterior corridors', () => {
  const seen: CorridorAssignment[][] = [];
  const result = optimizeCorridors({
    machines,
    bundles,
    baseline: empty,
    evaluate(assignments) {
      seen.push(assignments);
      return { value: 'candidate', routes: [] };
    },
  });
  expect(result.value).toBe('baseline');
  expect(result.assignments).toBeNull();
  expect(result.candidatesEvaluated).toBe(seen.length + 1);
  expect(result.candidatesEvaluated).toBeLessThanOrEqual(12);
  expect(
    seen.some((assignment) =>
      assignment.every((bundle) => bundle.location === 'inside'),
    ),
  ).toBe(true);
  expect(
    seen.some((assignment) =>
      assignment.every((bundle) => bundle.location === 'outside'),
    ),
  ).toBe(true);
  for (const assignment of seen) {
    const occupied: number[] = [];
    for (const bundle of assignment) {
      expect(bundle.tracks).toHaveLength(2);
      expect(Math.abs(bundle.tracks[0]! - bundle.tracks[1]!)).toBe(2);
      for (const x of bundle.tracks) {
        expect(
          machines.every(
            (machine) => x < machine.x || x > machine.x + machine.width,
          ),
        ).toBe(true);
        expect(
          occupied.every((previous) => Math.abs(previous - x) >= 1.999),
        ).toBe(true);
        occupied.push(x);
      }
    }
  }
});

it('selects actual routed quality and retains the baseline when every alternative is worse', () => {
  const baseline = {
    value: 'baseline',
    routes: [
      route('a', 'alpha', [
        [0, 5],
        [10, 5],
      ]),
      route('b', 'beta', [
        [5, 0],
        [5, 10],
      ]),
    ],
  };
  const improved = optimizeCorridors({
    machines,
    bundles,
    baseline,
    evaluate: () => ({
      value: 'improved',
      routes: [
        route('a', 'alpha', [
          [0, 0],
          [0, 10],
        ]),
      ],
    }),
  });
  expect(improved.value).toBe('improved');
  expect(improved.quality.crossings).toBe(0);
  expect(improved.baselineQuality.crossings).toBe(1);
  expect(
    optimizeCorridors({
      machines,
      bundles,
      baseline: empty,
      evaluate: () => baseline,
    }).value,
  ).toBe('baseline');
});

it('does not depend on resource names or input order', () => {
  function candidates(input: CorridorBundle[]) {
    const values: CorridorAssignment[][] = [];
    optimizeCorridors({
      machines,
      bundles: input,
      baseline: empty,
      evaluate: (assignment) => {
        values.push(assignment);
        return empty;
      },
    });
    return values.map((assignment) =>
      assignment
        .map(({ id, ...geometry }) => ({
          ...geometry,
          name: input.find((bundle) => bundle.id === id)!.preferredSide,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }
  expect(candidates(bundles)).toEqual(
    candidates(
      [...bundles]
        .reverse()
        .map((bundle, i) => ({ ...bundle, id: `unrelated-${i}` })),
    ),
  );
});

it('adapts to mirrored, uneven machine rows and rejects corridors too narrow for a bundle', () => {
  const crowded = [
    ...machines,
    { x: 12, y: 20, width: 8, height: 10 },
    { x: 24, y: 20, width: 8, height: 10 },
  ];
  const seen: CorridorAssignment[][] = [];
  optimizeCorridors({
    machines: crowded,
    bundles: [{ id: 'many', lanes: 4, preferredSide: 'west' }],
    baseline: empty,
    evaluate: (assignment) => {
      seen.push(assignment);
      return empty;
    },
  });
  expect(
    seen.every((assignment) =>
      assignment.every((bundle) => bundle.location === 'outside'),
    ),
  ).toBe(true);
  const mirror = (boxes: typeof machines) =>
    boxes.map((box) => ({ ...box, x: -box.x - box.width }));
  function selected(boxes: typeof machines, input: CorridorBundle[]) {
    return optimizeCorridors({
      machines: boxes,
      bundles: input,
      baseline: { ...empty, invalid: 1 },
      maxCandidates: 2,
      evaluate: (assignment) => ({
        value: assignment
          .flatMap((bundle) => bundle.tracks)
          .sort((a, b) => a - b)
          .join(','),
        routes: [],
      }),
    })
      .value.split(',')
      .map(Number);
  }
  const left = selected(machines, bundles);
  const right = selected(
    mirror(machines),
    bundles.map((bundle) => ({
      ...bundle,
      preferredSide: bundle.preferredSide === 'west' ? 'east' : 'west',
      terminals: (bundle.terminals ?? []).map((point) => ({
        ...point,
        x: -point.x,
      })),
    })),
  );
  expect(right).toEqual(left.map((x) => -x).reverse());
});

it('validates lane counts and caps caller-requested search size', () => {
  expect(() =>
    optimizeCorridors({
      machines,
      bundles: [{ id: 'bad', lanes: 0, preferredSide: 'west' }],
      baseline: empty,
      evaluate: () => empty,
    }),
  ).toThrow(/lanes/);
  const result = optimizeCorridors({
    machines,
    bundles,
    baseline: empty,
    maxCandidates: 1000,
    evaluate: () => empty,
  });
  expect(result.candidatesEvaluated).toBeLessThanOrEqual(16);
});
