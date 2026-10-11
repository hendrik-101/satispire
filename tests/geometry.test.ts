import { describe, expect, it } from 'vitest';
import {
  generateBlock,
  generateFloors,
  syntheticGeometry,
} from '../src/domain/geometry.js';

describe('synthetic machine blocks', () => {
  it.each([1, 2, 3, 4])('places all sixteen machines with %i rows', (rows) => {
    const block = generateBlock({ count: 16, rows });
    expect(block.machines).toHaveLength(16);
    expect(block.rowCounts).toHaveLength(rows);
    expect(block.rowCounts.reduce((sum, count) => sum + count, 0)).toBe(16);
    expect(
      Math.max(...block.rowCounts) - Math.min(...block.rowCounts),
    ).toBeLessThanOrEqual(1);
    for (const machine of block.machines) {
      expect(machine.bounds.x).toBeGreaterThanOrEqual(0);
      expect(machine.bounds.y).toBeGreaterThanOrEqual(0);
      expect(machine.bounds.x + machine.bounds.width).toBeLessThanOrEqual(
        block.footprint.width,
      );
      expect(machine.bounds.y + machine.bounds.depth).toBeLessThanOrEqual(
        block.footprint.depth,
      );
    }
    for (let i = 0; i < block.machines.length; i++)
      for (let j = i + 1; j < block.machines.length; j++) {
        const a = block.machines[i]!.bounds,
          b = block.machines[j]!.bounds;
        expect(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.depth <= b.y ||
            b.y + b.depth <= a.y,
        ).toBe(true);
      }
  });

  it('distributes remainder machines to the first rows', () => {
    expect(generateBlock({ count: 16, rows: 3 }).rowCounts).toEqual([6, 5, 5]);
  });

  it.each([
    [0, 'west', 'east'],
    [1, 'north', 'south'],
    [2, 'east', 'west'],
    [3, 'south', 'north'],
  ] as const)(
    'rotates machine and aggregate ports by %i clockwise turns',
    (rotation, input, output) => {
      const original = generateBlock({ count: 5, rows: 2 });
      const rotated = generateBlock({ count: 5, rows: 2, rotation });
      expect(rotated.ports.map((port) => port.side)).toEqual([input, output]);
      expect(
        rotated.machines.every(
          (machine) =>
            machine.input.side === input && machine.output.side === output,
        ),
      ).toBe(true);
      for (const machine of rotated.machines)
        for (const port of [machine.input, machine.output]) {
          if (port.side === 'west')
            expect(port.position.x).toBe(machine.bounds.x);
          if (port.side === 'east')
            expect(port.position.x).toBe(
              machine.bounds.x + machine.bounds.width,
            );
          if (port.side === 'north')
            expect(port.position.y).toBe(machine.bounds.y);
          if (port.side === 'south')
            expect(port.position.y).toBe(
              machine.bounds.y + machine.bounds.depth,
            );
        }
      expect(rotated.footprint).toEqual(
        rotation % 2 === 0
          ? original.footprint
          : {
              width: original.footprint.depth,
              depth: original.footprint.width,
            },
      );
      for (const port of rotated.ports) {
        expect(port.position.x).toBeGreaterThanOrEqual(0);
        expect(port.position.y).toBeGreaterThanOrEqual(0);
        expect(port.position.x).toBeLessThanOrEqual(rotated.footprint.width);
        expect(port.position.y).toBeLessThanOrEqual(rotated.footprint.depth);
      }
    },
  );

  it('connects aggregate ports through splitter and merger chains to every machine', () => {
    const block = generateBlock({ count: 4, rows: 2 });
    const graph = block.manifold;
    expect(graph.nodes.filter((node) => node.kind === 'splitter')).toHaveLength(
      4,
    );
    expect(graph.nodes.filter((node) => node.kind === 'merger')).toHaveLength(
      4,
    );
    const reachable = (from: string, to: string) => {
      const seen = new Set<string>([from]);
      const queue = [from];
      while (queue.length) {
        const next = queue.shift();
        for (const edge of graph.edges.filter((edge) => edge.from === next)) {
          if (!seen.has(edge.to)) {
            seen.add(edge.to);
            queue.push(edge.to);
          }
        }
      }
      return seen.has(to);
    };
    for (const machine of block.machines) {
      expect(reachable(block.ports[0]!.id, machine.id)).toBe(true);
      expect(reachable(machine.id, block.ports[1]!.id)).toBe(true);
    }
  });

  it('records synthetic provenance and serializes deterministically', () => {
    const args = { count: 16, rows: 3, rotation: 1 as const };
    const block = generateBlock(args);
    expect(block.provenance).toEqual({
      source: 'synthetic',
      verification: 'synthetic-only',
      unit: 'logical-grid',
      physicalBuildability: 'not-verified',
    });
    expect(JSON.parse(JSON.stringify(block))).toEqual(block);
    expect(generateBlock(args)).toEqual(block);
    expect(syntheticGeometry.source).toBe('synthetic');
  });

  it.each([
    [{ count: 0, rows: 1 }, /count/],
    [{ count: 1.2, rows: 1 }, /count/],
    [{ count: 1, rows: 0 }, /rows/],
    [{ count: 2, rows: 3 }, /rows/],
    [{ count: 4097, rows: 1 }, /count/],
    [{ count: 2, rows: 1, rotation: 4 }, /rotation/],
    [{ count: Infinity, rows: 1 }, /count/],
    [{ count: 2, rows: NaN }, /rows/],
  ] as const)(
    'rejects invalid counts, rows, and rotations: %j',
    (args, error) => {
      expect(() =>
        generateBlock(args as Parameters<typeof generateBlock>[0]),
      ).toThrow(error);
    },
  );

  it('rejects unknown and unverified geometry', () => {
    expect(() =>
      generateBlock({
        count: 1,
        rows: 1,
        geometry: { ...syntheticGeometry, id: 'unknown' },
      }),
    ).toThrow(/geometry/i);
    expect(() =>
      generateBlock({
        count: 1,
        rows: 1,
        geometry: {
          ...syntheticGeometry,
          source: 'game',
          verification: 'unverified',
        },
      }),
    ).toThrow(/geometry/i);
    expect(() =>
      generateBlock({
        count: 1,
        rows: 1,
        geometry: { ...syntheticGeometry, width: 1 },
      }),
    ).toThrow(/geometry/i);
  });
});

describe('synthetic stories', () => {
  const blocks = [
    { id: 'lower', floor: 0, count: 2, rows: 1 },
    { id: 'upper', floor: 2, count: 2, rows: 1 },
  ];
  const args = {
    footprint: { width: 24, depth: 20 },
    floorCount: 3,
    floorHeight: 6,
    blocks,
    connections: [{ id: 'lift-a', fromBlock: 'lower', toBlock: 'upper' }],
  };

  it('gives every story the requested equal footprint and continuous lift reservation', () => {
    const result = generateFloors(args);
    expect(result.floors).toHaveLength(3);
    expect(
      result.floors.every(
        (floor) =>
          JSON.stringify(floor.footprint) === JSON.stringify(args.footprint),
      ),
    ).toBe(true);
    const corridor = result.liftCorridors[0]!;
    expect(corridor.floorIndices).toEqual([0, 1, 2]);
    expect(result.floors.map((floor) => floor.reservedCorridors)).toEqual([
      [corridor.bounds],
      [corridor.bounds],
      [corridor.bounds],
    ]);
    for (const floor of result.floors)
      for (const placed of floor.blocks) {
        expect(placed.bounds.x + placed.bounds.width).toBeLessThanOrEqual(
          corridor.bounds.x,
        );
      }
    expect(result.connections[0]).toMatchObject({
      id: 'lift-a',
      fromFloor: 0,
      toFloor: 2,
      liftCorridorId: 'corridor-lift-a',
    });
  });

  it('packs multiple blocks on a floor without overlaps', () => {
    const result = generateFloors({
      ...args,
      footprint: { width: 32, depth: 20 },
      connections: [],
      blocks: [
        { id: 'a', floor: 0, count: 2, rows: 1 },
        { id: 'b', floor: 0, count: 2, rows: 1 },
        { id: 'c', floor: 0, count: 2, rows: 1 },
      ],
    });
    const placed = result.floors[0]!.blocks;
    expect(placed).toHaveLength(3);
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!.bounds,
          b = placed[j]!.bounds;
        expect(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.depth <= b.y ||
            b.y + b.depth <= a.y,
        ).toBe(true);
      }
  });

  it('preserves explicit placements and rejects overlap including lift reservations', () => {
    const explicit = [
      { ...blocks[0]!, position: { x: 0, y: 0 } },
      { id: 'conflict', floor: 0, count: 1, rows: 1, position: { x: 1, y: 1 } },
    ];
    expect(() =>
      generateFloors({ ...args, connections: [], blocks: explicit }),
    ).toThrow(/overlap/i);
    expect(() =>
      generateFloors({
        ...args,
        blocks: [{ ...blocks[0]!, position: { x: 10, y: 0 } }, blocks[1]!],
      }),
    ).toThrow(/corridor/i);
    const result = generateFloors({
      ...args,
      connections: [],
      blocks: [{ ...blocks[0]!, position: { x: 2, y: 3 } }],
    });
    expect(result.floors[0]!.blocks[0]!.bounds).toMatchObject({ x: 2, y: 3 });
  });

  it('reserves separate corridors for independent vertical connections', () => {
    const result = generateFloors({
      ...args,
      connections: [
        ...args.connections,
        { id: 'lift-b', fromBlock: 'upper', toBlock: 'lower' },
      ],
    });
    expect(result.liftCorridors).toHaveLength(2);
    expect(result.liftCorridors[0]!.bounds.x).not.toBe(
      result.liftCorridors[1]!.bounds.x,
    );
  });

  it('leaves floors outside the lift span free and uses no lift for a same-floor connection', () => {
    const result = generateFloors({ ...args, floorCount: 4 });
    expect(result.floors[3]!.reservedCorridors).toEqual([]);
    const sameFloor = generateFloors({
      ...args,
      blocks: [
        { ...blocks[0]!, floor: 0 },
        { ...blocks[1]!, floor: 0 },
      ],
    });
    expect(sameFloor.liftCorridors).toEqual([]);
    expect(sameFloor.connections[0]!.liftCorridorId).toBeNull();
  });

  it('can use the full allowed machine height and preserves rotated block footprints', () => {
    const result = generateFloors({
      footprint: { width: 8, depth: 14 },
      floorCount: 1,
      floorHeight: 4,
      maxHeight: 4,
      blocks: [{ id: 'rotated', floor: 0, count: 2, rows: 1, rotation: 1 }],
    });
    expect(result.totalHeight).toBe(4);
    expect(result.floors[0]!.blocks[0]!.bounds).toEqual({
      x: 0,
      y: 0,
      width: 8,
      depth: 14,
    });
  });

  it.each([
    { floorCount: 0 },
    { floorCount: 1.5 },
    { floorHeight: 3 },
    { floorHeight: 4.5 },
    { maxHeight: 17 },
    { maxMachinesPerFloor: 1 },
    { footprint: { width: 3, depth: 3 } },
    { footprint: { width: -1, depth: 20 } },
    { blocks: [{ ...blocks[0]!, floor: 3 }] },
    { blocks: [blocks[0]!, blocks[0]!] },
    { connections: [{ id: 'bad', fromBlock: 'missing', toBlock: 'upper' }] },
    { connections: [args.connections[0]!, args.connections[0]!] },
    { blocks: [{ ...blocks[0]!, position: { x: 1.5, y: 0 } }] },
    { blocks: [{ ...blocks[0]!, position: { x: 22, y: 19 } }] },
  ])(
    'rejects infeasible capacity, height, placement, and invalid references: %j',
    (change) => {
      expect(() => generateFloors({ ...args, ...change })).toThrow();
    },
  );

  it('distinguishes height and machine capacity failures', () => {
    expect(() => generateFloors({ ...args, maxHeight: 17 })).toThrow(/height/i);
    expect(() => generateFloors({ ...args, maxMachinesPerFloor: 1 })).toThrow(
      /capacity/i,
    );
    expect(() => generateFloors({ ...args, floorHeight: 3 })).toThrow(
      /floorHeight/i,
    );
  });

  it('returns a deterministic JSON-serializable result', () => {
    const result = generateFloors(args);
    expect(generateFloors(args)).toEqual(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('copies only supported footprint and position fields into the serializable result', () => {
    const footprint = { ...args.footprint, ignored: () => 'caller-only' };
    const position = { x: 0, y: 0, ignored: () => 'caller-only' };
    const result = generateFloors({
      ...args,
      connections: [],
      footprint,
      blocks: [{ ...blocks[0]!, position }],
    });
    expect(result.footprint).toEqual(args.footprint);
    expect(result.floors[0]!.footprint).toEqual(args.footprint);
    expect(result.floors[0]!.blocks[0]!.bounds).toEqual({
      x: 0,
      y: 0,
      width: 14,
      depth: 8,
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
