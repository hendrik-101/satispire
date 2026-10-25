import type { generateSupplyLayout } from '../../src/domain/supply-layout.js';
import type {
  TransportEdge,
  TransportNode,
} from '../../src/domain/belt-routing.js';
import type { CorridorAssignment } from './corridor-optimizer.js';
import { symbolInputFraction, symbolOutputFraction } from './machine-symbol.js';
import {
  deliveryPitch,
  transportBodyHalf,
  transportPortRadius,
} from './transport-symbol.js';

type Floor = ReturnType<typeof generateSupplyLayout>['floors'][number];
export type BeltPoint = { x: number; y: number };
type Box = BeltPoint & { width: number; height: number };
type Context = {
  shift: number;
  inputSpines: number[];
  outputRail: number;
  inputAnchors: BeltPoint[];
  output: BeltPoint;
  labels: Box[];
  outputLabel: Box;
  corridors?: readonly CorridorAssignment[];
};
const directions = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];
const junction = (node: TransportNode) =>
  ['splitter', 'merger', 'pipe-junction'].includes(node.kind);
const distinct = (points: BeltPoint[]) =>
  points.filter(
    (p, i) => !i || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y,
  );
function simplify(points: BeltPoint[]) {
  const result: BeltPoint[] = [];
  for (const point of distinct(points)) {
    while (result.length > 1) {
      const a = result[result.length - 2]!,
        b = result[result.length - 1]!;
      if ((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))
        result.pop();
      else break;
    }
    result.push(point);
  }
  return result;
}

function collision(a: BeltPoint, b: BeltPoint, box: Box) {
  const epsilon = 0.015;
  return a.x === b.x
    ? a.x > box.x + epsilon &&
        a.x < box.x + box.width - epsilon &&
        Math.max(a.y, b.y) > box.y + epsilon &&
        Math.min(a.y, b.y) < box.y + box.height - epsilon
    : a.y === b.y &&
        a.y > box.y + epsilon &&
        a.y < box.y + box.height - epsilon &&
        Math.max(a.x, b.x) > box.x + epsilon &&
        Math.min(a.x, b.x) < box.x + box.width - epsilon;
}

/** Detour around labels and symbols; crossings between belts do not create junctions. */
function clearObstacles(initial: BeltPoint[], obstacles: Box[]) {
  let points = simplify(initial);
  for (let attempt = 0; attempt < 80; attempt++) {
    let changed = false;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!,
        b = points[i]!;
      const box = obstacles.find((obstacle) => collision(a, b, obstacle));
      if (!box) continue;
      const margin = 0.6;
      const candidates =
        a.x === b.x
          ? [box.x - margin, box.x + box.width + margin].map((x) => [
              { x, y: a.y },
              { x, y: b.y },
            ])
          : [box.y - margin, box.y + box.height + margin].map((y) => [
              { x: a.x, y },
              { x: b.x, y },
            ]);
      candidates.sort((left, right) => {
        const cost = (middle: BeltPoint[]) =>
          Math.abs(a.x - middle[0]!.x) +
          Math.abs(a.y - middle[0]!.y) +
          Math.abs(b.x - middle[1]!.x) +
          Math.abs(b.y - middle[1]!.y) +
          obstacles.filter((obstacle) =>
            [a, ...middle, b].some(
              (p, n, list) => n > 0 && collision(list[n - 1]!, p, obstacle),
            ),
          ).length *
            1000;
        return cost(left) - cost(right);
      });
      points.splice(i, 0, ...candidates[0]!);
      points = simplify(points);
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return points;
}

type Segment = { a: BeltPoint; b: BeltPoint };
function segments(points: BeltPoint[]): Segment[] {
  return points.slice(1).map((b, i) => ({ a: points[i]!, b }));
}
function overlap(first: Segment, second: Segment) {
  const epsilon = 0.02;
  if (
    Math.abs(first.a.x - first.b.x) < epsilon &&
    Math.abs(second.a.x - second.b.x) < epsilon &&
    Math.abs(first.a.x - second.a.x) < epsilon
  )
    return (
      Math.min(
        Math.max(first.a.y, first.b.y),
        Math.max(second.a.y, second.b.y),
      ) -
        Math.max(
          Math.min(first.a.y, first.b.y),
          Math.min(second.a.y, second.b.y),
        ) >
      epsilon
    );
  if (
    Math.abs(first.a.y - first.b.y) < epsilon &&
    Math.abs(second.a.y - second.b.y) < epsilon &&
    Math.abs(first.a.y - second.a.y) < epsilon
  )
    return (
      Math.min(
        Math.max(first.a.x, first.b.x),
        Math.max(second.a.x, second.b.x),
      ) -
        Math.max(
          Math.min(first.a.x, first.b.x),
          Math.min(second.a.x, second.b.x),
        ) >
      epsilon
    );
  return false;
}

/** Give every belt its own track; perpendicular crossings remain separate. */
function reserveTrack(
  initial: BeltPoint[],
  reserved: Segment[],
  obstacles: Box[],
  accepts: (points: BeltPoint[]) => boolean = () => true,
) {
  let points = initial;
  const conflicts = (candidate: BeltPoint[]) =>
    segments(candidate).reduce(
      (sum, segment) =>
        sum + reserved.filter((previous) => overlap(segment, previous)).length,
      0,
    );
  for (let attempt = 0; attempt < 32; attempt++) {
    const current = segments(points);
    const index = current.findIndex((segment) =>
      reserved.some((previous) => overlap(segment, previous)),
    );
    if (index < 0) break;
    const { a, b } = current[index]!;
    const previousConflicts = conflicts(points);
    let best = points,
      bestConflicts = previousConflicts,
      bestLength = Infinity;
    for (let step = 1; step <= 16; step++)
      for (const sign of [-1, 1]) {
        const offset = step * sign * 0.9;
        const middle =
          a.x === b.x
            ? [
                { x: a.x + offset, y: a.y },
                { x: b.x + offset, y: b.y },
              ]
            : [
                { x: a.x, y: a.y + offset },
                { x: b.x, y: b.y + offset },
              ];
        const candidate = clearObstacles(
          [
            ...points.slice(0, index + 1),
            ...middle,
            ...points.slice(index + 1),
          ],
          obstacles,
        );
        if (!accepts(candidate)) continue;
        if (
          segments(candidate).some((segment) =>
            obstacles.some((box) => collision(segment.a, segment.b, box)),
          )
        )
          continue;
        const count = conflicts(candidate);
        const length = segments(candidate).reduce(
          (sum, segment) =>
            sum +
            Math.abs(segment.a.x - segment.b.x) +
            Math.abs(segment.a.y - segment.b.y),
          0,
        );
        if (
          count < bestConflicts ||
          (count === bestConflicts &&
            count < previousConflicts &&
            length < bestLength)
        ) {
          best = candidate;
          bestConflicts = count;
          bestLength = length;
        }
      }
    if (best === points) break;
    points = best;
  }
  return points;
}

/** Prefer a small number of long, normal port approaches over local jogs. */
function polishRoute(
  initial: BeltPoint[],
  start: { p: BeltPoint; stub: BeltPoint },
  end: { p: BeltPoint; stub: BeltPoint },
  obstacles: Box[],
  reserved: Segment[],
  accepts: (points: BeltPoint[]) => boolean = () => true,
) {
  if (initial.length < 4) return initial;
  const { p: p, stub: a } = start;
  const { p: q, stub: b } = end;
  const xs = [
    ...new Set([
      a.x,
      b.x,
      (a.x + b.x) / 2,
      p.x - 3,
      p.x + 3,
      q.x - 3,
      q.x + 3,
      ...initial.map((point) => point.x),
    ]),
  ];
  const ys = [
    ...new Set([
      a.y,
      b.y,
      (a.y + b.y) / 2,
      p.y - 3,
      p.y + 3,
      q.y - 3,
      q.y + 3,
      ...initial.map((point) => point.y),
    ]),
  ];
  const candidates: BeltPoint[][] = [
    [p, a, { x: a.x, y: b.y }, b, q],
    [p, a, { x: b.x, y: a.y }, b, q],
    ...xs.map((x) => [p, a, { x, y: a.y }, { x, y: b.y }, b, q]),
    ...ys.map((y) => [p, a, { x: a.x, y }, { x: b.x, y }, b, q]),
  ];
  const length = (segment: Segment) =>
    Math.abs(segment.a.x - segment.b.x) + Math.abs(segment.a.y - segment.b.y);
  const cost = (points: BeltPoint[]) =>
    (points.length - 2) * 100 +
    segments(points).reduce(
      (sum, segment, index, list) =>
        sum +
        length(segment) * 0.01 +
        (index > 0 && index < list.length - 1 && length(segment) < 1.2
          ? 30
          : 0),
      0,
    );
  const follows = (origin: BeltPoint, stub: BeltPoint, next: BeltPoint) =>
    stub.x === origin.x
      ? next.x === origin.x && (next.y - origin.y) * (stub.y - origin.y) > 0
      : next.y === origin.y && (next.x - origin.x) * (stub.x - origin.x) > 0;
  const blocked = (points: BeltPoint[]) =>
    segments(points).some(
      (segment) =>
        obstacles.some((box) => collision(segment.a, segment.b, box)) ||
        reserved.some((previous) => overlap(segment, previous)),
    );
  let best = initial,
    score = blocked(initial) ? Infinity : cost(initial);
  for (const points of candidates
    .map(simplify)
    .sort((left, right) => cost(left) - cost(right))) {
    const value = cost(points);
    if (value >= score) break;
    if (!accepts(points)) continue;
    if (!follows(p, a, points[1]!) || !follows(q, b, points.at(-2)!)) continue;
    const parts = segments(points);
    if (
      parts.some(
        (segment) =>
          obstacles.some((box) => collision(segment.a, segment.b, box)) ||
          reserved.some((previous) => overlap(segment, previous)),
      )
    )
      continue;
    best = points;
    score = value;
  }
  return best;
}

export function placeBeltNetwork(floor: Floor, context: Context) {
  const { shift, inputAnchors, output, outputRail } = context;
  const graph = floor.transport;
  const corridorById = new Map(
    context.corridors?.map((bundle) => [bundle.id, bundle]),
  );
  const assignedSpine = (node: TransportNode) =>
    corridorById.get(`${node.flow}:${node.itemId}`)?.tracks[node.lane];
  let corridorViolations = 0;
  const machines = new Map(
    floor.machines.map((machine) => [machine.id, machine]),
  );
  const feedOffset = (itemId: string) =>
    floor.inputs
      .slice(
        0,
        floor.inputs.findIndex((feed) => feed.itemId === itemId),
      )
      .reduce((sum, feed) => sum + feed.lines, 0);
  const inputLane = (node: TransportNode) =>
    feedOffset(node.itemId) + node.lane;
  const leftOutput =
    floor.outputSide === 'west' || floor.outputSide === 'north';
  const sign = leftOutput ? -1 : 1;
  const collectionY = (node: TransportNode) => {
    const machine = machines.get(node.machineId!)!;
    return machine.y + shift + machine.depth + 4 + node.lane * 3.2;
  };
  const distributionY = (node: TransportNode) =>
    machines.get(node.machineId!)!.y + shift - 4 - inputLane(node) * 3.2;
  const position = (node: TransportNode): BeltPoint => {
    if (node.kind === 'inlet') {
      const index = floor.inputs.findIndex(
        (input) => input.itemId === node.itemId,
      );
      return {
        x: inputAnchors[index]!.x,
        y:
          inputAnchors[index]!.y +
          (node.lane - (floor.inputs[index]!.lines - 1) / 2) * deliveryPitch,
      };
    }
    if (node.kind === 'outlet')
      return {
        x: output.x,
        y: output.y + (node.lane - (graph.outputLines - 1) / 2) * deliveryPitch,
      };
    if (node.stage === 'delivery')
      return {
        x:
          outputRail +
          sign *
            (graph.collectors * 2 + deliveryPitch + node.order * deliveryPitch),
        y: output.y + (node.lane - (graph.outputLines - 1) / 2) * deliveryPitch,
      };
    const machine = machines.get(node.machineId!)!;
    const feed = floor.inputs.findIndex(
      (input) => input.itemId === node.itemId,
    );
    const x =
      machine.x +
      shift +
      machine.width *
        (node.flow === 'input'
          ? symbolInputFraction(feed, floor.inputs.length)
          : symbolOutputFraction);
    return {
      x,
      y:
        node.placement === 'port'
          ? machine.y + shift + (node.flow === 'output' ? machine.depth : 0)
          : node.flow === 'input'
            ? distributionY(node)
            : collectionY(node),
    };
  };
  const placed = new Map(
    graph.nodes.map((node) => [node.id, { ...node, ...position(node) }]),
  );
  const portSides = new Map<string, BeltPoint>();
  for (const node of graph.nodes) {
    const p = placed.get(node.id)!;
    const edges = graph.edges.filter(
      (edge) => edge.from === node.id || edge.to === node.id,
    );
    if (!junction(node)) {
      const direction =
        node.kind === 'machine-input'
          ? directions[0]!
          : node.kind === 'machine-output'
            ? directions[2]!
            : node.kind === 'inlet'
              ? {
                  x:
                    p.x <
                    context.labels[
                      floor.inputs.findIndex(
                        (feed) => feed.itemId === node.itemId,
                      )
                    ]!.x +
                      context.labels[
                        floor.inputs.findIndex(
                          (feed) => feed.itemId === node.itemId,
                        )
                      ]!.width /
                        2
                      ? -1
                      : 1,
                  y: 0,
                }
              : {
                  x:
                    p.x < context.outputLabel.x + context.outputLabel.width / 2
                      ? -1
                      : 1,
                  y: 0,
                };
      for (const edge of edges)
        portSides.set(`${edge.id}:${node.id}`, direction);
      continue;
    }
    let best: number[] = [],
      bestCost = Infinity;
    const assign = (chosen: number[]) => {
      if (chosen.length === edges.length) {
        let cost = 0;
        edges.forEach((edge, index) => {
          const other = placed.get(
            edge.from === node.id ? edge.to : edge.from,
          )!;
          const dx = other.x - p.x,
            dy = other.y - p.y;
          const length = Math.hypot(dx, dy) || 1;
          const direction = directions[chosen[index]!]!;
          cost += 1 - (dx * direction.x + dy * direction.y) / length;
          if (
            other.placement === 'port' &&
            other.machineId === node.machineId
          ) {
            const desiredY = node.flow === 'input' ? 1 : -1;
            if (direction.x !== 0 || direction.y !== desiredY) cost += 100;
          }
        });
        if (cost < bestCost) {
          best = chosen;
          bestCost = cost;
        }
        return;
      }
      for (let i = 0; i < 4; i++)
        if (!chosen.includes(i)) assign([...chosen, i]);
    };
    assign([]);
    edges.forEach((edge, i) =>
      portSides.set(`${edge.id}:${node.id}`, directions[best[i]!]!),
    );
  }
  const port = (edge: TransportEdge, node: TransportNode) => {
    const p = placed.get(node.id)!,
      direction = portSides.get(`${edge.id}:${node.id}`)!;
    const offset = junction(node) ? transportPortRadius : 0;
    return {
      p: { x: p.x + direction.x * offset, y: p.y + direction.y * offset },
      stub: {
        x: p.x + direction.x * (offset + 0.7),
        y: p.y + direction.y * (offset + 0.7),
      },
    };
  };
  const row = (node: TransportNode) => machines.get(node.machineId!)!.row;
  const sideSpine = (node: TransportNode, input: boolean) => {
    const assigned = assignedSpine(node);
    if (assigned !== undefined) return assigned;
    const r = row(node);
    const reverseRows = input
      ? floor.inputSide === 'south'
      : floor.outputSide === 'north';
    const traversal = reverseRows ? floor.rowCounts.length - 1 - r : r;
    const initiallyLeft = input
      ? floor.inputSide !== 'east'
      : floor.outputSide !== 'west';
    const towardRight = initiallyLeft !== (traversal % 2 === 1);
    const lane = input ? inputLane(node) : node.lane;
    return towardRight
      ? shift + floor.width + 4 + lane * 2
      : shift - 4 - lane * 2;
  };
  const nodeBoxes = graph.nodes.filter(junction).map((node) => {
    const p = placed.get(node.id)!;
    return {
      x: p.x - transportBodyHalf,
      y: p.y - transportBodyHalf,
      width: transportBodyHalf * 2,
      height: transportBodyHalf * 2,
    };
  });
  const obstacles = [
    ...context.labels,
    context.outputLabel,
    ...nodeBoxes,
    ...floor.machines.map((machine) => ({
      x: machine.x + shift,
      y: machine.y + shift,
      width: machine.width,
      height: machine.depth,
    })),
  ];
  const reserved: Segment[] = [];
  const belts = graph.edges.map((edge) => {
    const from = placed.get(edge.from)!,
      to = placed.get(edge.to)!;
    const a = port(edge, from),
      b = port(edge, to);
    let middle: BeltPoint[];
    let backbone: Segment | undefined;
    const preserveSpine = (x: number, fromY: number, toY: number) => {
      if (context.corridors && Math.abs(toY - fromY) > 0.000001)
        backbone = { a: { x, y: fromY }, b: { x, y: toY } };
    };
    if (edge.flow === 'input') {
      const destinationRail = distributionY(to);
      if (from.kind === 'inlet') {
        const spine = context.inputSpines[inputLane(to)]!;
        const entry = destinationRail - 1.4;
        middle = [
          { x: spine, y: a.stub.y },
          { x: spine, y: entry },
          { x: b.stub.x, y: entry },
        ];
      } else if (row(from) !== row(to)) {
        const spine = sideSpine(from, true);
        preserveSpine(spine, a.stub.y, destinationRail);
        middle = [
          { x: spine, y: a.stub.y },
          { x: spine, y: destinationRail },
          { x: b.stub.x, y: destinationRail },
        ];
      } else middle = [{ x: b.stub.x, y: a.stub.y }];
    } else if (to.stage === 'collection') {
      const sourceRail = collectionY(from),
        destinationRail = collectionY(to);
      if (row(from) !== row(to)) {
        const spine = sideSpine(from, false);
        preserveSpine(spine, sourceRail, destinationRail);
        middle = [
          { x: a.stub.x, y: sourceRail },
          { x: spine, y: sourceRail },
          { x: spine, y: destinationRail },
          { x: b.stub.x, y: destinationRail },
        ];
      } else
        middle = [
          { x: a.stub.x, y: destinationRail },
          { x: b.stub.x, y: destinationRail },
        ];
    } else if (from.stage === 'collection') {
      const exit = collectionY(from) + 1.4;
      const spine = outputRail + sign * from.lane * 2;
      middle = [
        { x: a.stub.x, y: exit },
        { x: spine, y: exit },
        { x: spine, y: b.stub.y },
      ];
    } else {
      const turn = (a.stub.x + b.stub.x) / 2 + sign * (edge.lane % 4) * 0.22;
      middle = [
        { x: turn, y: a.stub.y },
        { x: turn, y: b.stub.y },
      ];
    }
    // Every segment is orthogonal, including the final short port approach.
    const points = [
      a.p,
      a.stub,
      ...middle,
      { x: b.stub.x, y: middle[middle.length - 1]?.y ?? a.stub.y },
      b.stub,
      b.p,
    ];
    const accepts = (candidate: BeltPoint[]) =>
      !backbone ||
      segments(candidate).some(
        ({ a, b }) =>
          Math.abs(a.x - backbone!.a.x) < 0.000001 &&
          Math.abs(b.x - backbone!.a.x) < 0.000001 &&
          Math.min(a.y, b.y) <=
            Math.min(backbone!.a.y, backbone!.b.y) + 0.000001 &&
          Math.max(a.y, b.y) >=
            Math.max(backbone!.a.y, backbone!.b.y) - 0.000001,
      );
    const reservedRoute = reserveTrack(
      clearObstacles(points, obstacles),
      reserved,
      obstacles,
      accepts,
    );
    const routed = polishRoute(
      reservedRoute,
      a,
      b,
      obstacles,
      reserved,
      accepts,
    );
    if (!accepts(routed)) corridorViolations++;
    reserved.push(...segments(routed));
    return { ...edge, points: routed };
  });
  return { nodes: [...placed.values()], belts, portSides, corridorViolations };
}
