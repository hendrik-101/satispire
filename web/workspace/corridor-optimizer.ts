/** Pure schematic corridor search. Geometry is logical, not verified game clearance. */
export type CorridorPoint = { x: number; y: number };
export type CorridorBox = CorridorPoint & { width: number; height: number };
export type CorridorBundle = {
  id: string;
  lanes: number;
  preferredSide: 'west' | 'east';
  terminals?: readonly CorridorPoint[];
};
export type CorridorAssignment = {
  id: string;
  tracks: number[];
  side: 'west' | 'east';
  location: 'inside' | 'outside';
};
export type CorridorRoute = {
  id: string;
  resourceId: string;
  points: readonly CorridorPoint[];
};
export type RouteQuality = {
  invalid: number;
  overlaps: number;
  crossings: number;
  mixing: number;
  bends: number;
  length: number;
  area: number;
};
export type CorridorEvaluation<T> = {
  value: T;
  routes: readonly CorridorRoute[];
  obstacles?: readonly CorridorBox[];
  invalid?: number;
};
const epsilon = 0.000001;
const near = (a: number, b: number) => Math.abs(a - b) < epsilon;
type Segment = {
  route: number;
  resource: string;
  horizontal: boolean;
  at: number;
  low: number;
  high: number;
};
function lowerBound(values: number[], target: number) {
  let low = 0,
    high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Count proper perpendicular crossings in O(segments log segments). Endpoints are ports/bends. */
function crossings(segments: Segment[]) {
  const horizontal = segments.filter((segment) => segment.horizontal);
  const ys = [...new Set(horizontal.map((segment) => segment.at))].sort(
    (a, b) => a - b,
  );
  const tree = new Float64Array(ys.length + 1);
  const add = (index: number, value: number) => {
    for (let n = index + 1; n < tree.length; n += n & -n) tree[n]! += value;
  };
  const sum = (index: number) => {
    let result = 0;
    for (let n = index; n > 0; n -= n & -n) result += tree[n]!;
    return result;
  };
  const events = segments.flatMap((segment) =>
    segment.horizontal
      ? [
          { x: segment.low, kind: 2, segment },
          { x: segment.high, kind: 0, segment },
        ]
      : [{ x: segment.at, kind: 1, segment }],
  );
  events.sort((a, b) => a.x - b.x || a.kind - b.kind);
  const ownHorizontal = new Map<number, Segment[]>();
  for (const segment of horizontal) {
    const own = ownHorizontal.get(segment.route) ?? [];
    own.push(segment);
    ownHorizontal.set(segment.route, own);
  }
  let count = 0;
  for (const { kind, segment } of events) {
    if (kind !== 1) add(lowerBound(ys, segment.at), kind === 2 ? 1 : -1);
    else {
      count +=
        sum(lowerBound(ys, segment.high - epsilon)) -
        sum(lowerBound(ys, segment.low + epsilon));
      for (const own of ownHorizontal.get(segment.route) ?? [])
        if (
          own.low < segment.at &&
          own.high > segment.at &&
          own.at > segment.low + epsilon &&
          own.at < segment.high - epsilon
        )
          count--;
    }
  }
  return count;
}

/** Resource identity is used only for equality; names, colors and item semantics have no role. */
export function measureRouteQuality(
  routes: readonly CorridorRoute[],
  obstacles: readonly CorridorBox[] = [],
  invalid = 0,
): RouteQuality {
  const all: Segment[] = [];
  const quality: RouteQuality = {
    invalid,
    overlaps: 0,
    crossings: 0,
    mixing: 0,
    bends: 0,
    length: 0,
    area: 0,
  };
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  routes.forEach((route, index) => {
    let previous: boolean | undefined;
    if (route.points.length < 2) quality.invalid++;
    for (const point of route.points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    for (let n = 1; n < route.points.length; n++) {
      const a = route.points[n - 1]!,
        b = route.points[n]!;
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) {
        quality.invalid++;
        continue;
      }
      if (near(a.x, b.x) && near(a.y, b.y)) continue;
      const horizontal = near(a.y, b.y);
      if (!horizontal && !near(a.x, b.x)) {
        quality.invalid++;
        continue;
      }
      if (previous !== undefined && previous !== horizontal) quality.bends++;
      previous = horizontal;
      const segment: Segment = {
        route: index,
        resource: route.resourceId,
        horizontal,
        at: horizontal ? a.y : a.x,
        low: Math.min(horizontal ? a.x : a.y, horizontal ? b.x : b.y),
        high: Math.max(horizontal ? a.x : a.y, horizontal ? b.x : b.y),
      };
      quality.length += segment.high - segment.low;
      all.push(segment);
      for (const box of obstacles) {
        const at = horizontal ? box.y : box.x;
        const size = horizontal ? box.height : box.width;
        const low = horizontal ? box.x : box.y;
        const extent = horizontal ? box.width : box.height;
        if (
          segment.at > at + epsilon &&
          segment.at < at + size - epsilon &&
          segment.high > low + epsilon &&
          segment.low < low + extent - epsilon
        )
          quality.invalid++;
      }
    }
  });
  quality.area = all.length ? (maxX - minX) * (maxY - minY) : 0;
  quality.crossings = crossings(all);
  // Collinear positive-length sharing hides an individual belt even for the same resource.
  const groups = new Map<string, Segment[]>();
  for (const segment of all) {
    const key = `${segment.horizontal}:${Math.round(segment.at / epsilon)}`;
    const group = groups.get(key) ?? [];
    group.push(segment);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.low - b.low);
    for (let i = 0; i < group.length; i++)
      for (
        let j = i + 1;
        j < group.length && group[j]!.low < group[i]!.high - epsilon;
        j++
      )
        if (group[i]!.route !== group[j]!.route) quality.overlaps++;
  }
  // Sample horizontal cuts through vertical buses. A,B,A is one fragmented resource group.
  const vertical = all.filter((segment) => !segment.horizontal);
  const span = maxY - minY;
  if (span > epsilon)
    for (let sample = 0; sample < 32; sample++) {
      const y = minY + (span * (sample + 0.5)) / 32;
      const cut = vertical
        .filter((segment) => segment.low < y && segment.high > y)
        .sort((a, b) => a.at - b.at);
      const seen = new Set<string>();
      let previous: string | undefined;
      for (const segment of cut) {
        if (segment.resource === previous) continue;
        if (seen.has(segment.resource)) quality.mixing += 1 / 32;
        seen.add(segment.resource);
        previous = segment.resource;
      }
    }
  return quality;
}

/** Lexicographic priorities prevent a shorter invalid route from beating a valid one. */
export function compareRouteQuality(a: RouteQuality, b: RouteQuality) {
  for (const key of [
    'invalid',
    'overlaps',
    'crossings',
    'mixing',
    'bends',
    'length',
    'area',
  ] as const) {
    const difference = a[key] - b[key];
    if (Math.abs(difference) > epsilon) return difference;
  }
  return 0;
}

type Corridor = {
  low: number;
  high: number;
  location: 'inside' | 'outside';
  side?: 'west' | 'east';
};
type State = {
  assignments: CorridorAssignment[];
  used: number[];
  cost: number;
};

/**
 * Bounded deterministic search over free column corridors and bundled track orderings.
 * The callback routes each proposal; its measured result decides, including the baseline.
 * This is a best-candidate heuristic, not a claim of global optimality or buildability.
 */
export function optimizeCorridors<T>(options: {
  machines: readonly CorridorBox[];
  bundles: readonly CorridorBundle[];
  baseline: CorridorEvaluation<T>;
  evaluate: (assignments: CorridorAssignment[]) => CorridorEvaluation<T>;
  maxCandidates?: number;
  lanePitch?: number;
  clearance?: number;
}) {
  const pitch = options.lanePitch ?? 2,
    clearance = options.clearance ?? 0.6;
  if (
    !Number.isFinite(pitch) ||
    pitch <= 0 ||
    !Number.isFinite(clearance) ||
    clearance < 0
  )
    throw new Error('Corridor spacing must be finite and positive.');
  const ids = new Set<string>();
  for (const bundle of options.bundles) {
    if (!Number.isSafeInteger(bundle.lanes) || bundle.lanes < 1)
      throw new Error('Corridor bundle lanes must be positive integers.');
    if (ids.has(bundle.id))
      throw new Error('Corridor bundle IDs must be unique.');
    ids.add(bundle.id);
    if (
      bundle.terminals?.some(
        (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
      )
    )
      throw new Error('Corridor terminals must be finite.');
  }
  for (const box of options.machines)
    if (
      ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
      box.width < 0 ||
      box.height < 0
    )
      throw new Error(
        'Corridor machine bounds must be finite and nonnegative.',
      );
  const budget = Math.max(
    1,
    Math.min(16, Math.floor(options.maxCandidates ?? 12) || 1),
  );
  const baselineQuality = measureRouteQuality(
    options.baseline.routes,
    options.baseline.obstacles,
    options.baseline.invalid,
  );
  let value = options.baseline.value,
    quality = baselineQuality;
  let assignments: CorridorAssignment[] | null = null,
    candidatesEvaluated = 1;
  if (!options.bundles.length || budget === 1)
    return {
      value,
      assignments,
      quality,
      baselineQuality,
      candidatesEvaluated,
    };
  const projected = options.machines
    .map((box) => ({ low: box.x, high: box.x + box.width }))
    .sort((a, b) => a.low - b.low);
  const merged: { low: number; high: number }[] = [];
  for (const interval of projected) {
    const last = merged.at(-1);
    if (last && interval.low <= last.high)
      last.high = Math.max(last.high, interval.high);
    else merged.push({ ...interval });
  }
  const low = merged[0]?.low ?? 0,
    high = merged.at(-1)?.high ?? 0;
  const corridors: Corridor[] = [
    {
      low: -Infinity,
      high: low - clearance,
      location: 'outside',
      side: 'west',
    },
    ...merged.slice(1).map((interval, i) => ({
      low: merged[i]!.high + clearance,
      high: interval.low - clearance,
      location: 'inside' as const,
    })),
    {
      low: high + clearance,
      high: Infinity,
      location: 'outside',
      side: 'east',
    },
  ];
  const center = (bundle: CorridorBundle, axis: 'x' | 'y') =>
    bundle.terminals?.length
      ? bundle.terminals.reduce((sum, point) => sum + point[axis], 0) /
        bundle.terminals.length
      : 0;
  const ordered = [...options.bundles].sort(
    (a, b) =>
      a.preferredSide.localeCompare(b.preferredSide) ||
      center(a, 'y') - center(b, 'y') ||
      a.lanes - b.lanes ||
      center(a, 'x') - center(b, 'x'),
  );
  const place = (
    state: State,
    bundle: CorridorBundle,
    index: number,
  ): State | null => {
    const corridor = corridors[index]!,
      used = state.used[index]!;
    const side = corridor.side ?? bundle.preferredSide;
    const reverse = side === 'west';
    const tracks = Array.from({ length: bundle.lanes }, (_, lane) =>
      reverse
        ? corridor.high - (used + lane) * pitch
        : corridor.low + (used + lane) * pitch,
    );
    // Interior corridors always pack from the same end, keeping resources contiguous.
    if (corridor.location === 'inside')
      for (let lane = 0; lane < tracks.length; lane++)
        tracks[lane] = corridor.low + (used + lane) * pitch;
    if (
      tracks.some(
        (x) => x < corridor.low - epsilon || x > corridor.high + epsilon,
      )
    )
      return null;
    const nextUsed = [...state.used];
    nextUsed[index]! += bundle.lanes;
    const average = tracks.reduce((sum, x) => sum + x, 0) / tracks.length;
    const distance = bundle.terminals?.length
      ? bundle.terminals.reduce(
          (sum, point) => sum + Math.abs(point.x - average),
          0,
        ) / bundle.terminals.length
      : Math.abs(average - (bundle.preferredSide === 'west' ? low : high));
    return {
      assignments: [
        ...state.assignments,
        { id: bundle.id, tracks, side, location: corridor.location },
      ],
      used: nextUsed,
      cost:
        state.cost +
        distance * bundle.lanes +
        (side !== bundle.preferredSide ? pitch : 0),
    };
  };
  const initial = (): State => ({
    assignments: [],
    used: corridors.map(() => 0),
    cost: 0,
  });
  const proposals: CorridorAssignment[][] = [];
  const unique = new Set<string>();
  const offer = (candidate: CorridorAssignment[]) => {
    const key = [...candidate]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((bundle) => `${bundle.id}:${bundle.tracks.join(',')}`)
      .join(';');
    if (!unique.has(key)) {
      unique.add(key);
      proposals.push(candidate);
    }
  };
  // Explicit exterior alternatives ensure that congestion can move an entire resource bus.
  for (const swap of [false, true]) {
    let state = initial();
    for (const bundle of ordered)
      state = place(
        state,
        bundle,
        (bundle.preferredSide === 'west') !== swap ? 0 : corridors.length - 1,
      )!;
    offer(state.assignments);
  }
  const search = (order: CorridorBundle[], insideOnly = false) => {
    let beam = [initial()];
    for (const bundle of order) {
      const next: State[] = [];
      for (const state of beam)
        for (let index = 0; index < corridors.length; index++) {
          if (insideOnly && corridors[index]!.location !== 'inside') continue;
          const candidate = place(state, bundle, index);
          if (candidate) next.push(candidate);
        }
      next.sort((a, b) => a.cost - b.cost);
      beam = next.slice(0, 48);
    }
    return beam;
  };
  // Keep an interior proposal even when external terminals make its proxy cost high.
  const interior = search(ordered, true)[0];
  if (interior) offer(interior.assignments);
  const finalists = [...search(ordered), ...search([...ordered].reverse())];
  finalists.sort((a, b) => a.cost - b.cost);
  for (const state of finalists) offer(state.assignments);
  for (const proposal of proposals.slice(0, budget - 1)) {
    const evaluated = options.evaluate(proposal);
    const measured = measureRouteQuality(
      evaluated.routes,
      evaluated.obstacles,
      evaluated.invalid,
    );
    candidatesEvaluated++;
    if (compareRouteQuality(measured, quality) < 0) {
      value = evaluated.value;
      quality = measured;
      assignments = proposal;
    }
  }
  return { value, assignments, quality, baselineQuality, candidatesEvaluated };
}
