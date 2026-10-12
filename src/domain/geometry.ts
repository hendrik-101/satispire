export type QuarterTurn = 0 | 1 | 2 | 3;
export type CardinalSide = 'north' | 'east' | 'south' | 'west';
export interface Point {
  x: number;
  y: number;
}
export interface Footprint {
  width: number;
  depth: number;
}
export interface Bounds extends Point, Footprint {}
export interface GeometryDefinition extends Footprint {
  id: string;
  version: number;
  source: string;
  verification: string;
  unit: string;
  height: number;
}
export interface SyntheticProvenance {
  source: 'synthetic';
  verification: 'synthetic-only';
  unit: 'logical-grid';
  physicalBuildability: 'not-verified';
}
export interface Port {
  id: string;
  direction: 'input' | 'output';
  side: CardinalSide;
  position: Point;
}
export interface MachinePlacement {
  id: string;
  row: number;
  column: number;
  bounds: Bounds;
  input: Port;
  output: Port;
}
export interface ManifoldNode {
  id: string;
  kind:
    | 'splitter'
    | 'merger'
    | 'machine'
    | 'aggregate-input'
    | 'aggregate-output';
  position: Point;
}
export interface ManifoldEdge {
  from: string;
  to: string;
}
export interface BlockParameters {
  count: number;
  rows: number;
  rotation?: QuarterTurn;
  geometry?: GeometryDefinition;
}
export interface GeneratedBlock {
  kind: 'synthetic-block';
  geometryId: string;
  geometryVersion: number;
  provenance: SyntheticProvenance;
  rotation: QuarterTurn;
  footprint: Footprint;
  height: number;
  rowCounts: number[];
  machines: MachinePlacement[];
  ports: [Port, Port];
  manifold: {
    topology: 'logical-manifold';
    nodes: ManifoldNode[];
    edges: ManifoldEdge[];
  };
}
export interface FloorBlockParameters extends BlockParameters {
  id: string;
  floor: number;
  position?: Point;
}
export interface FloorConnectionParameters {
  id: string;
  fromBlock: string;
  toBlock: string;
}
export interface FloorsParameters {
  footprint: Footprint;
  floorCount: number;
  floorHeight: number;
  blocks: FloorBlockParameters[];
  connections?: FloorConnectionParameters[];
  maxHeight?: number;
  maxMachinesPerFloor?: number;
}
export interface PlacedFloorBlock {
  id: string;
  bounds: Bounds;
  block: GeneratedBlock;
}
export interface LiftCorridor {
  id: string;
  connectionId: string;
  bounds: Bounds;
  floorIndices: number[];
}
export interface FloorConnection extends FloorConnectionParameters {
  fromFloor: number;
  toFloor: number;
  liftCorridorId: string | null;
}
export interface GeneratedFloors {
  kind: 'synthetic-floors';
  provenance: SyntheticProvenance;
  footprint: Footprint;
  totalHeight: number;
  floors: {
    index: number;
    elevation: number;
    footprint: Footprint;
    blocks: PlacedFloorBlock[];
    reservedCorridors: Bounds[];
  }[];
  liftCorridors: LiftCorridor[];
  connections: FloorConnection[];
}

export const syntheticGeometry: Readonly<GeometryDefinition> = Object.freeze({
  id: 'synthetic-machine-v1',
  version: 1,
  source: 'synthetic',
  verification: 'synthetic-only',
  unit: 'logical-grid',
  width: 4,
  depth: 4,
  height: 4,
});

const provenance = (): SyntheticProvenance => ({
  source: 'synthetic',
  verification: 'synthetic-only',
  unit: 'logical-grid',
  physicalBuildability: 'not-verified',
});

function integer(value: number, name: string, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
}

function validateGeometry(geometry: GeometryDefinition): void {
  if (
    !geometry ||
    Object.entries(syntheticGeometry).some(
      ([key, value]) => geometry[key as keyof GeometryDefinition] !== value,
    )
  ) {
    throw new Error(
      'Geometry must match the versioned synthetic definition; unknown or unverified game geometry is unsupported',
    );
  }
}

function rotatePoint(
  point: Point,
  footprint: Footprint,
  turns: QuarterTurn,
): Point {
  if (turns === 0) return { ...point };
  if (turns === 1) return { x: footprint.depth - point.y, y: point.x };
  if (turns === 2)
    return { x: footprint.width - point.x, y: footprint.depth - point.y };
  return { x: point.y, y: footprint.width - point.x };
}

function rotateBounds(
  bounds: Bounds,
  footprint: Footprint,
  turns: QuarterTurn,
): Bounds {
  const corners = [
    rotatePoint(bounds, footprint, turns),
    rotatePoint(
      { x: bounds.x + bounds.width, y: bounds.y + bounds.depth },
      footprint,
      turns,
    ),
  ];
  const x = Math.min(corners[0]!.x, corners[1]!.x);
  const y = Math.min(corners[0]!.y, corners[1]!.y);
  return {
    x,
    y,
    width: turns % 2 ? bounds.depth : bounds.width,
    depth: turns % 2 ? bounds.width : bounds.depth,
  };
}

function rotatePort(
  port: Port,
  footprint: Footprint,
  turns: QuarterTurn,
): Port {
  const sides: CardinalSide[] = ['north', 'east', 'south', 'west'];
  return {
    ...port,
    side: sides[(sides.indexOf(port.side) + turns) % 4]!,
    position: rotatePoint(port.position, footprint, turns),
  };
}

/** A logical manifold graph, not a route for individually buildable belts. */
export function generateBlock(parameters: BlockParameters): GeneratedBlock {
  const {
    count,
    rows,
    rotation = 0,
    geometry = syntheticGeometry,
  } = parameters;
  integer(count, 'count', 1, 4096);
  integer(rows, 'rows', 1, count);
  integer(rotation, 'rotation', 0, 3);
  validateGeometry(geometry);
  const rowCounts = Array.from(
    { length: rows },
    (_, row) => Math.floor(count / rows) + (row < count % rows ? 1 : 0),
  );
  const footprint = {
    width: Math.ceil(count / rows) * 6 + 2,
    depth: rows * 6 + 2,
  };
  const machines: MachinePlacement[] = [];
  const nodes: ManifoldNode[] = [];
  const edges: ManifoldEdge[] = [];
  const ports: [Port, Port] = [
    {
      id: 'aggregate-input',
      direction: 'input',
      side: 'west',
      position: { x: 0, y: 4 },
    },
    {
      id: 'aggregate-output',
      direction: 'output',
      side: 'east',
      position: { x: footprint.width, y: rows * 6 - 2 },
    },
  ];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < rowCounts[row]!; column++) {
      const id = `machine-${machines.length + 1}`;
      const bounds = {
        x: 2 + column * 6,
        y: 2 + row * 6,
        width: geometry.width,
        depth: geometry.depth,
      };
      const input: Port = {
        id: `${id}-input`,
        direction: 'input',
        side: 'west',
        position: { x: bounds.x, y: bounds.y + 2 },
      };
      const output: Port = {
        id: `${id}-output`,
        direction: 'output',
        side: 'east',
        position: { x: bounds.x + bounds.width, y: bounds.y + 2 },
      };
      machines.push({ id, row, column, bounds, input, output });
      nodes.push(
        { id, kind: 'machine', position: { x: bounds.x + 2, y: bounds.y + 2 } },
        {
          id: `splitter-${machines.length}`,
          kind: 'splitter',
          position: { x: bounds.x - 1, y: bounds.y + 2 },
        },
        {
          id: `merger-${machines.length}`,
          kind: 'merger',
          position: { x: bounds.x + bounds.width + 1, y: bounds.y + 2 },
        },
      );
      edges.push(
        { from: `splitter-${machines.length}`, to: id },
        { from: id, to: `merger-${machines.length}` },
      );
    }
  }
  nodes.push(
    { id: ports[0].id, kind: 'aggregate-input', position: ports[0].position },
    { id: ports[1].id, kind: 'aggregate-output', position: ports[1].position },
  );
  edges.push({ from: ports[0].id, to: 'splitter-1' });
  for (let index = 1; index < count; index++) {
    edges.push(
      { from: `splitter-${index}`, to: `splitter-${index + 1}` },
      { from: `merger-${index}`, to: `merger-${index + 1}` },
    );
  }
  edges.push({ from: `merger-${count}`, to: ports[1].id });
  return {
    kind: 'synthetic-block',
    geometryId: geometry.id,
    geometryVersion: geometry.version,
    provenance: provenance(),
    rotation,
    footprint:
      rotation % 2
        ? { width: footprint.depth, depth: footprint.width }
        : footprint,
    height: geometry.height,
    rowCounts,
    machines: machines.map((machine) => ({
      ...machine,
      bounds: rotateBounds(machine.bounds, footprint, rotation),
      input: rotatePort(machine.input, footprint, rotation),
      output: rotatePort(machine.output, footprint, rotation),
    })),
    ports: [
      rotatePort(ports[0], footprint, rotation),
      rotatePort(ports[1], footprint, rotation),
    ],
    manifold: {
      topology: 'logical-manifold',
      nodes: nodes.map((node) => ({
        ...node,
        position: rotatePoint(node.position, footprint, rotation),
      })),
      edges,
    },
  };
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.depth &&
    b.y < a.y + a.depth
  );
}

function inside(bounds: Bounds, footprint: Footprint): boolean {
  return (
    bounds.x >= 0 &&
    bounds.y >= 0 &&
    bounds.x + bounds.width <= footprint.width &&
    bounds.y + bounds.depth <= footprint.depth
  );
}

function uniqueId(id: string, ids: Set<string>, label: string): void {
  if (typeof id !== 'string' || !id.trim() || id.length > 128 || ids.has(id))
    throw new Error(
      `${label} IDs must be unique, nonempty strings of at most 128 characters`,
    );
  ids.add(id);
}

/** Deterministic first-fit placement with one reserved strip per vertical connection. */
export function generateFloors(parameters: FloorsParameters): GeneratedFloors {
  const {
    footprint,
    floorCount,
    floorHeight,
    blocks,
    connections = [],
    maxHeight = 256,
    maxMachinesPerFloor = 4096,
  } = parameters;
  integer(footprint.width, 'footprint width', 1, 512);
  integer(footprint.depth, 'footprint depth', 1, 512);
  integer(floorCount, 'floorCount', 1, 64);
  integer(floorHeight, 'floorHeight', syntheticGeometry.height, 512);
  integer(maxHeight, 'maxHeight', 1, 32768);
  integer(maxMachinesPerFloor, 'maxMachinesPerFloor', 1, 4096);
  if (floorCount * floorHeight > maxHeight)
    throw new Error('Total height exceeds maxHeight');
  if (!Array.isArray(blocks) || blocks.length > 256)
    throw new Error('blocks must be an array of at most 256 entries');
  if (!Array.isArray(connections) || connections.length > 256)
    throw new Error('connections must be an array of at most 256 entries');
  let totalMachines = 0;
  for (const block of blocks) {
    integer(block.count, 'count', 1, 4096);
    totalMachines += block.count;
  }
  if (totalMachines > 16384) {
    throw new Error('Building machine count exceeds capacity of 16384');
  }
  const ids = new Set<string>();
  const prepared = blocks.map((parameters) => {
    uniqueId(parameters.id, ids, 'Block');
    integer(parameters.floor, 'block floor', 0, floorCount - 1);
    if (parameters.position !== undefined) {
      integer(parameters.position.x, 'position x', 0, footprint.width);
      integer(parameters.position.y, 'position y', 0, footprint.depth);
    }
    return { parameters, block: generateBlock(parameters) };
  });
  const floorById = new Map(blocks.map((block) => [block.id, block.floor]));
  const connectionIds = new Set<string>();
  const liftCorridors: LiftCorridor[] = [];
  const resolvedConnections: FloorConnection[] = connections.map(
    (connection) => {
      uniqueId(connection.id, connectionIds, 'Connection');
      const fromFloor = floorById.get(connection.fromBlock),
        toFloor = floorById.get(connection.toBlock);
      if (fromFloor === undefined || toFloor === undefined)
        throw new Error('Connection references unknown block');
      if (connection.fromBlock === connection.toBlock)
        throw new Error('Connection endpoints must be different blocks');
      let liftCorridorId: string | null = null;
      if (fromFloor !== toFloor) {
        liftCorridorId = `corridor-${connection.id}`;
        const x = footprint.width - (liftCorridors.length + 1) * 2;
        if (x < 0)
          throw new Error('Lift corridor capacity exceeds footprint width');
        const firstFloor = Math.min(fromFloor, toFloor),
          lastFloor = Math.max(fromFloor, toFloor);
        liftCorridors.push({
          id: liftCorridorId,
          connectionId: connection.id,
          bounds: { x, y: 0, width: 2, depth: footprint.depth },
          floorIndices: Array.from(
            { length: lastFloor - firstFloor + 1 },
            (_, i) => firstFloor + i,
          ),
        });
      }
      return {
        id: connection.id,
        fromBlock: connection.fromBlock,
        toBlock: connection.toBlock,
        fromFloor,
        toFloor,
        liftCorridorId,
      };
    },
  );
  const floors: GeneratedFloors['floors'] = Array.from(
    { length: floorCount },
    (_, index) => {
      const entries = prepared.filter(
        (entry) => entry.parameters.floor === index,
      );
      if (
        entries.reduce((total, entry) => total + entry.parameters.count, 0) >
        maxMachinesPerFloor
      )
        throw new Error(`Floor ${index} machine capacity exceeded`);
      const reservedCorridors = liftCorridors
        .filter((corridor) => corridor.floorIndices.includes(index))
        .map((corridor) => ({ ...corridor.bounds }));
      const placements = new Map<string, PlacedFloorBlock>();
      const add = (entry: (typeof prepared)[number], bounds: Bounds) => {
        if (!inside(bounds, footprint))
          throw new Error(
            `Block ${entry.parameters.id} exceeds floor footprint`,
          );
        if (reservedCorridors.some((corridor) => overlaps(bounds, corridor)))
          throw new Error(
            `Block ${entry.parameters.id} overlaps a reserved lift corridor`,
          );
        if (
          [...placements.values()].some((placed) =>
            overlaps(bounds, placed.bounds),
          )
        )
          throw new Error(
            `Block ${entry.parameters.id} overlaps another block`,
          );
        placements.set(entry.parameters.id, {
          id: entry.parameters.id,
          bounds,
          block: entry.block,
        });
      };
      for (const entry of entries.filter(
        (entry) => entry.parameters.position !== undefined,
      )) {
        add(entry, {
          x: entry.parameters.position!.x,
          y: entry.parameters.position!.y,
          ...entry.block.footprint,
        });
      }
      for (const entry of entries.filter(
        (entry) => entry.parameters.position === undefined,
      )) {
        const occupied = [
          ...reservedCorridors,
          ...[...placements.values()].map((placed) => placed.bounds),
        ];
        const xs = [
          ...new Set([0, ...occupied.map((bounds) => bounds.x + bounds.width)]),
        ].sort((a, b) => a - b);
        const ys = [
          ...new Set([0, ...occupied.map((bounds) => bounds.y + bounds.depth)]),
        ].sort((a, b) => a - b);
        let position: Bounds | undefined;
        for (const y of ys) {
          for (const x of xs) {
            const candidate = { x, y, ...entry.block.footprint };
            if (
              inside(candidate, footprint) &&
              !occupied.some((bounds) => overlaps(candidate, bounds))
            ) {
              position = candidate;
              break;
            }
          }
          if (position) break;
        }
        if (!position)
          throw new Error(
            `Floor ${index} has insufficient placement capacity for block ${entry.parameters.id}`,
          );
        add(entry, position);
      }
      return {
        index,
        elevation: index * floorHeight,
        footprint: { width: footprint.width, depth: footprint.depth },
        blocks: entries.map((entry) => placements.get(entry.parameters.id)!),
        reservedCorridors,
      };
    },
  );
  return {
    kind: 'synthetic-floors',
    provenance: provenance(),
    footprint: { width: footprint.width, depth: footprint.depth },
    totalHeight: floorCount * floorHeight,
    floors,
    liftCorridors,
    connections: resolvedConnections,
  };
}
