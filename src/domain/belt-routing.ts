import type { Catalog } from './catalog.js';
import type { ProductionPlan } from './production.js';
import { Rational } from './rational.js';
import { transportCapacity, type TechnologyProfile } from './technology.js';

export interface TransportNode {
  id: string;
  kind:
    | 'inlet'
    | 'outlet'
    | 'machine-input'
    | 'machine-output'
    | 'splitter'
    | 'merger'
    | 'pipe-junction';
  itemId: string;
  flow: 'input' | 'output';
  placement: 'terminal' | 'rail' | 'port';
  stage: 'distribution' | 'collection' | 'delivery';
  lane: number;
  order: number;
  machineId?: number;
  terminalId?: string;
}

export interface TransportEdge {
  id: string;
  from: string;
  to: string;
  itemId: string;
  flow: 'input' | 'output';
  rate: string;
  capacity: string;
  tier: number;
  transport: 'belt' | 'pipe';
  lane: number;
}

export interface TransportGraph {
  itemId: string;
  nodes: TransportNode[];
  edges: TransportEdge[];
  inputs: { itemId: string; lines: number; terminalIds: string[] }[];
  outputs: {
    terminalId: string;
    itemId: string;
    rate: string;
    lines: number;
  }[];
  outputLines: number;
  collectors: number;
}

interface Transfer {
  id: string;
  fromItemId: string;
  toItemId: string;
  rate: string;
}

export interface TransportMachineOrder {
  itemId: string;
  input: number[];
  output: number[];
}

interface Group {
  machines: number[];
  rate: Rational;
}
interface Endpoint {
  node: TransportNode;
  rate: Rational;
}
const ZERO = Rational.parse('0');
const count = (value: number) => Rational.fromBigInts(BigInt(value));
const sum = (rates: Rational[]) => rates.reduce((a, b) => a.add(b), ZERO);

/** Whole-machine lanes avoid passive mergers joining independently fed inputs. */
function groups(
  rate: string,
  machines: number,
  capacity: Rational,
  order = Array.from({ length: machines }, (_, index) => index + 1),
): Group[] {
  if (!Number.isSafeInteger(machines) || machines < 1 || machines > 512)
    throw new Error('Transport machine capacity exceeded');
  if (
    order.length !== machines ||
    new Set(order).size !== machines ||
    order.some((id) => !Number.isSafeInteger(id) || id < 1 || id > machines)
  )
    throw new Error('Invalid transport machine order');
  const perMachine = Rational.parseCanonical(rate).divide(count(machines));
  if (perMachine.compare(ZERO) <= 0 || perMachine.compare(capacity) > 0)
    throw new Error('Per-machine transport capacity exceeded');
  // floor(capacity / perMachine), using exact ceil because Rational has no floor.
  const ratio = capacity.divide(perMachine);
  const rounded = ratio.ceil();
  const fit = Number(
    ratio.compare(Rational.fromBigInts(rounded)) === 0 ? rounded : rounded - 1n,
  );
  const size = Math.min(machines, fit);
  return Array.from({ length: Math.ceil(machines / size) }, (_, lane) => {
    const ids = order.slice(lane * size, (lane + 1) * size);
    return { machines: ids, rate: perMachine.multiply(count(ids.length)) };
  });
}

function terminalRates(rate: string, capacity: Rational): Rational[] {
  let remaining = Rational.parseCanonical(rate);
  const rates: Rational[] = [];
  while (remaining.compare(ZERO) > 0) {
    if (rates.length >= 256)
      throw new Error('Transport lane capacity exceeded');
    const next = remaining.compare(capacity) > 0 ? capacity : remaining;
    rates.push(next);
    remaining = remaining.subtract(next);
  }
  return rates;
}

/** Exact logical belt/pipe topology; positions and physical buildability are absent. */
export function generateBeltRouting(
  catalog: Catalog,
  plan: ProductionPlan,
  technology: TechnologyProfile,
  transfers: readonly Transfer[],
  machineOrders: readonly TransportMachineOrder[] = [],
): TransportGraph[] {
  const inputGroups = new Map(
    plan.nodes.map((node) => [
      node.itemId,
      new Map(
        node.inputs.map((input) => [
          input.itemId,
          groups(
            input.rate,
            node.machineCount,
            transportCapacity(catalog, input.itemId, technology),
            machineOrders.find((order) => order.itemId === node.itemId)?.input,
          ),
        ]),
      ),
    ]),
  );
  return plan.nodes.map((production) => {
    const graph: TransportGraph = {
      itemId: production.itemId,
      nodes: [],
      edges: [],
      inputs: [],
      outputs: [],
      outputLines: 0,
      collectors: 0,
    };
    const addNode = (node: Omit<TransportNode, 'id'>): TransportNode => {
      const result = { ...node, id: `node:${graph.nodes.length}` };
      graph.nodes.push(result);
      return result;
    };
    const addEdge = (
      from: TransportNode,
      to: TransportNode,
      rate: Rational,
    ) => {
      const capacity = transportCapacity(catalog, from.itemId, technology);
      if (rate.compare(ZERO) <= 0 || rate.compare(capacity) > 0)
        throw new Error('Transport edge capacity exceeded');
      const pipe =
        catalog.items.find((item) => item.id === from.itemId)?.transport ===
        'pipe';
      graph.edges.push({
        id: `edge:${graph.edges.length}`,
        from: from.id,
        to: to.id,
        itemId: from.itemId,
        flow: from.flow,
        rate: rate.toString(),
        capacity: capacity.toString(),
        tier: pipe ? technology.pipeTier : technology.beltTier,
        transport: pipe ? 'pipe' : 'belt',
        lane: from.lane,
      });
    };
    const junction = (
      kind: 'splitter' | 'merger',
      near: TransportNode,
      order: number,
    ) =>
      addNode({
        ...near,
        kind:
          catalog.items.find((item) => item.id === near.itemId)?.transport ===
          'pipe'
            ? 'pipe-junction'
            : kind,
        placement: 'rail',
        order,
      });
    // n consumers need exactly n-1 sequential, two-way manifold splitters.
    const split = (source: TransportNode, destinations: Endpoint[]) => {
      let previous = source;
      let remaining = sum(destinations.map((d) => d.rate));
      destinations.forEach((destination, index) => {
        if (index === destinations.length - 1) {
          addEdge(previous, destination.node, destination.rate);
        } else {
          const next = junction('splitter', destination.node, index);
          addEdge(previous, next, remaining);
          addEdge(next, destination.node, destination.rate);
          previous = next;
          remaining = remaining.subtract(destination.rate);
        }
      });
    };
    // n producers need exactly n-1 sequential, two-way manifold mergers.
    const collect = (sources: Endpoint[], lane: number): Endpoint => {
      let result = sources[0]!;
      sources.slice(1).forEach((source, index) => {
        const next = junction('merger', { ...source.node, lane }, index);
        addEdge(result.node, next, result.rate);
        addEdge(source.node, next, source.rate);
        result = { node: next, rate: result.rate.add(source.rate) };
      });
      return result;
    };

    production.inputs.forEach((input, resourceOrder) => {
      const incoming = transfers.find(
        (transfer) =>
          transfer.fromItemId === input.itemId &&
          transfer.toItemId === production.itemId,
      );
      const terminalId = incoming?.id ?? `import:${input.itemId}`;
      const lanes = inputGroups.get(production.itemId)!.get(input.itemId)!;
      graph.inputs.push({
        itemId: input.itemId,
        lines: lanes.length,
        terminalIds: [terminalId],
      });
      const perMachine = Rational.parseCanonical(input.rate).divide(
        count(production.machineCount),
      );
      lanes.forEach((group, lane) => {
        const inlet = addNode({
          kind: 'inlet',
          itemId: input.itemId,
          flow: 'input',
          placement: 'terminal',
          stage: 'distribution',
          lane,
          order: lane,
          terminalId,
        });
        split(
          inlet,
          group.machines.map((machineId) => ({
            node: addNode({
              kind: 'machine-input',
              itemId: input.itemId,
              flow: 'input',
              placement: 'port',
              stage: 'distribution',
              lane,
              order: resourceOrder,
              machineId,
            }),
            rate: perMachine,
          })),
        );
      });
    });

    const capacity = transportCapacity(catalog, production.itemId, technology);
    const outputGroups = groups(
      production.rate,
      production.machineCount,
      capacity,
      machineOrders.find((order) => order.itemId === production.itemId)?.output,
    );
    graph.collectors = outputGroups.length;
    const perMachineOutput = Rational.parseCanonical(production.rate).divide(
      count(production.machineCount),
    );
    const sources = outputGroups.map((group, lane) =>
      collect(
        group.machines.map((machineId) => ({
          node: addNode({
            kind: 'machine-output',
            itemId: production.itemId,
            flow: 'output',
            placement: 'port',
            stage: 'collection',
            lane,
            order: 0,
            machineId,
          }),
          rate: perMachineOutput,
        })),
        lane,
      ),
    );
    const destinations: Endpoint[] = [];
    const target = plan.targets.find((t) => t.itemId === production.itemId);
    const outgoing = [
      ...(target
        ? [
            {
              terminalId: `target:${production.itemId}`,
              rate: target.rate,
              rates: terminalRates(target.rate, capacity),
            },
          ]
        : []),
      ...transfers
        .filter((transfer) => transfer.fromItemId === production.itemId)
        .map((transfer) => ({
          terminalId: transfer.id,
          rate: transfer.rate,
          rates: inputGroups
            .get(transfer.toItemId)!
            .get(production.itemId)!
            .map((group) => group.rate),
        })),
    ];
    outgoing.forEach((destination) => {
      graph.outputs.push({
        terminalId: destination.terminalId,
        itemId: production.itemId,
        rate: destination.rate,
        lines: destination.rates.length,
      });
      destination.rates.forEach((rate) => {
        const lane = destinations.length;
        destinations.push({
          node: addNode({
            kind: 'outlet',
            itemId: production.itemId,
            flow: 'output',
            placement: 'terminal',
            stage: 'delivery',
            lane,
            order: lane,
            terminalId: destination.terminalId,
          }),
          rate,
        });
      });
    });
    graph.outputLines = destinations.length;
    if (
      graph.inputs.reduce((total, input) => total + input.lines, 0) +
        graph.collectors +
        graph.outputLines >
      256
    )
      throw new Error('Transport lane capacity exceeded');
    if (
      sum(destinations.map((d) => d.rate)).compare(
        Rational.parseCanonical(production.rate),
      ) !== 0
    )
      throw new Error('Transport output demand does not match production');
    if (sources.length * destinations.length > 2048)
      throw new Error('Transport output mixing capacity exceeded');

    // Every collector feeds every destination in the same demand proportion.
    // Selective greedy shares can starve another destination when passive mergers
    // draw equally from branches with different downstream availability.
    const shares: Endpoint[][] = sources.map(() => []);
    const received: Endpoint[][] = destinations.map(() => []);
    const total = Rational.parseCanonical(production.rate);
    sources.forEach((source, sourceIndex) => {
      destinations.forEach((destination, destinationIndex) => {
        const rate = source.rate.multiply(destination.rate).divide(total);
        const share = addNode({
          kind: 'merger',
          itemId: production.itemId,
          flow: 'output',
          placement: 'rail',
          stage: 'delivery',
          lane: destination.node.lane,
          order: received[destinationIndex]!.length,
        });
        shares[sourceIndex]!.push({ node: share, rate });
        received[destinationIndex]!.push({ node: share, rate });
      });
    });
    // Share placeholders are removed after linking; they are edges, not machines.
    sources.forEach((source, index) => split(source.node, shares[index]!));
    destinations.forEach((destination, index) => {
      const result = collect(received[index]!, destination.node.lane);
      addEdge(result.node, destination.node, result.rate);
    });
    const placeholders = new Set(shares.flat().map((share) => share.node.id));
    placeholders.forEach((id) => {
      const incoming = graph.edges.find((edge) => edge.to === id)!;
      const outgoing = graph.edges.find((edge) => edge.from === id)!;
      incoming.to = outgoing.to;
      graph.edges.splice(graph.edges.indexOf(outgoing), 1);
    });
    graph.nodes = graph.nodes.filter((node) => !placeholders.has(node.id));
    const railOrders = new Map<string, number>();
    graph.nodes.forEach((node) => {
      if (node.placement !== 'rail' || node.stage !== 'delivery') return;
      const key = `${node.stage}:${node.lane}`;
      node.order = railOrders.get(key) ?? 0;
      railOrders.set(key, node.order + 1);
    });
    return graph;
  });
}
