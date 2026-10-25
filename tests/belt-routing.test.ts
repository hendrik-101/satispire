import { expect, it } from 'vitest';
import {
  generateBeltRouting,
  type TransportGraph,
} from '../src/domain/belt-routing.js';
import { deriveBuildVariants } from '../src/domain/build-variants.js';
import type { Catalog } from '../src/domain/catalog.js';
import {
  solveProduction,
  type ProductionPlan,
} from '../src/domain/production.js';
import { Rational } from '../src/domain/rational.js';
import { generateSupplyLayout } from '../src/domain/supply-layout.js';
import type { TechnologyProfile } from '../src/domain/technology.js';
import {
  availableChoices,
  technologyAtTier,
  vanillaCatalog,
} from '../src/domain/vanilla.js';

const zero = Rational.parse('0');
const sum = (rates: string[]) =>
  rates.reduce((total, rate) => total.add(Rational.parseCanonical(rate)), zero);
const technology = { ...technologyAtTier(4), beltTier: 2 };
const steelPlan = solveProduction(vanillaCatalog, {
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

function verify(graph: TransportGraph, plan: ProductionPlan) {
  const stage = plan.nodes.find((node) => node.itemId === graph.itemId)!;
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  expect(nodes.size).toBe(graph.nodes.length);
  expect(new Set(graph.edges.map((edge) => edge.id)).size).toBe(
    graph.edges.length,
  );
  graph.edges.forEach((edge) => {
    const from = nodes.get(edge.from)!;
    const to = nodes.get(edge.to)!;
    expect(from, edge.from).toBeDefined();
    expect(to, edge.to).toBeDefined();
    expect([from.itemId, from.flow]).toEqual([to.itemId, to.flow]);
    expect([edge.itemId, edge.flow]).toEqual([from.itemId, from.flow]);
    expect(Rational.parseCanonical(edge.rate).compare(zero)).toBeGreaterThan(0);
    expect(
      Rational.parseCanonical(edge.rate).compare(
        Rational.parseCanonical(edge.capacity),
      ),
    ).toBeLessThanOrEqual(0);
  });
  const reachable = (start: string, backwards: boolean) => {
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      graph.edges.forEach((edge) => {
        if ((backwards ? edge.to : edge.from) === id)
          queue.push(backwards ? edge.from : edge.to);
      });
    }
    return [...seen].map((id) => nodes.get(id)!);
  };
  graph.nodes.forEach((node) => {
    const incoming = graph.edges.filter((edge) => edge.to === node.id);
    const outgoing = graph.edges.filter((edge) => edge.from === node.id);
    if (node.placement === 'rail') {
      expect(sum(incoming.map((edge) => edge.rate)).toString()).toBe(
        sum(outgoing.map((edge) => edge.rate)).toString(),
      );
      expect(incoming.length).toBeGreaterThan(0);
      expect(outgoing.length).toBeGreaterThan(0);
      expect(incoming.length).toBeLessThanOrEqual(3);
      expect(outgoing.length).toBeLessThanOrEqual(3);
      expect(incoming.length + outgoing.length).toBeGreaterThanOrEqual(3);
      if (node.kind === 'splitter') expect(incoming).toHaveLength(1);
      if (node.kind === 'merger') expect(outgoing).toHaveLength(1);
    } else if (node.kind === 'inlet' || node.kind === 'machine-output') {
      expect(incoming).toHaveLength(0);
      expect(outgoing).toHaveLength(1);
      expect(
        reachable(node.id, false).some((n) =>
          node.kind === 'inlet'
            ? n.kind === 'machine-input'
            : n.kind === 'outlet',
        ),
      ).toBe(true);
    } else {
      expect(incoming).toHaveLength(1);
      expect(outgoing).toHaveLength(0);
      expect(
        reachable(node.id, true).some((n) =>
          node.kind === 'outlet'
            ? n.kind === 'machine-output'
            : n.kind === 'inlet',
        ),
      ).toBe(true);
    }
    if (node.kind === 'machine-input' || node.kind === 'machine-output') {
      const rate =
        node.kind === 'machine-output'
          ? stage.rate
          : stage.inputs.find((input) => input.itemId === node.itemId)!.rate;
      expect(
        sum([...incoming, ...outgoing].map((edge) => edge.rate)).toString(),
      ).toBe(
        Rational.parseCanonical(rate)
          .divide(Rational.parse(String(stage.machineCount)))
          .toString(),
      );
    }
  });
  expect(
    graph.nodes.filter((node) => node.kind === 'machine-output'),
  ).toHaveLength(stage.machineCount);
  stage.inputs.forEach((input) => {
    expect(
      graph.nodes.filter(
        (node) => node.kind === 'machine-input' && node.itemId === input.itemId,
      ),
    ).toHaveLength(stage.machineCount);
    const inputLanes = graph.nodes.filter(
      (node) => node.kind === 'inlet' && node.itemId === input.itemId,
    );
    expect(inputLanes.map((node) => node.lane)).toEqual(
      inputLanes.map((_, index) => index),
    );
  });
  const outlets = graph.nodes.filter((node) => node.kind === 'outlet');
  expect(outlets.map((node) => node.lane)).toEqual(
    outlets.map((_, index) => index),
  );
  expect(outlets).toHaveLength(graph.outputLines);
}

it('feeds four steel constructors with two actual Mk.2 belts and two splitters', () => {
  const layout = generateSupplyLayout(vanillaCatalog, steelPlan, technology, 2);
  const floor = layout.floors.find((f) => f.itemId === 'Desc_SteelPlate_C')!;
  expect(floor.machineCount).toBe(4);
  expect(floor.inputs[0]).toMatchObject({ rate: '210', lines: 2 });
  const input = floor.transport.nodes.filter((node) => node.flow === 'input');
  expect(input.filter((node) => node.kind === 'inlet')).toHaveLength(2);
  expect(input.filter((node) => node.kind === 'splitter')).toHaveLength(2);
  expect(input.filter((node) => node.kind === 'machine-input')).toHaveLength(4);
  const feeds = floor.transport.edges.filter((edge) =>
    input.some((node) => node.id === edge.to && node.kind === 'machine-input'),
  );
  expect(feeds.map((edge) => edge.rate)).toEqual(Array(4).fill('105/2'));
  layout.floors.forEach((f) => verify(f.transport, steelPlan));
});

// Original arithmetic fixture: capacities exercise topology, not game balance.
const fixture: Catalog = {
  schemaVersion: 1,
  catalogVersion: 'synthetic-routing-1',
  provenance: { kind: 'synthetic', source: 'Original routing test fixture' },
  items: [
    { id: 'fixture:raw', name: 'Raw', raw: true },
    { id: 'fixture:feed', name: 'Feed', raw: false },
    { id: 'fixture:part', name: 'Part', raw: false },
  ],
  machines: [{ id: 'fixture:machine', name: 'Fixture' }],
  recipes: [
    {
      id: 'fixture:feed-recipe',
      name: 'Feed',
      machineId: 'fixture:machine',
      durationSeconds: '1',
      inputs: [{ itemId: 'fixture:raw', quantity: '1' }],
      outputs: [{ itemId: 'fixture:feed', quantity: '1' }],
    },
    {
      id: 'fixture:part-recipe',
      name: 'Part',
      machineId: 'fixture:machine',
      durationSeconds: '1',
      inputs: [{ itemId: 'fixture:feed', quantity: '4/3' }],
      outputs: [{ itemId: 'fixture:part', quantity: '1' }],
    },
  ],
};
const fixtureTechnology: TechnologyProfile = {
  availableMachines: fixture.machines.map((machine) => machine.id),
  unlockedRecipes: fixture.recipes.map((recipe) => recipe.id),
  beltTier: 2,
  pipeTier: 1,
};
const fixtureInput = {
  targets: [
    { itemId: 'fixture:part', rate: '150' },
    { itemId: 'fixture:feed', rate: '20' },
  ],
  recipes: {
    'fixture:feed': 'fixture:feed-recipe',
    'fixture:part': 'fixture:part-recipe',
  },
  imports: ['fixture:raw'],
  technology: fixtureTechnology,
};

it('matches whole-machine input groups across transfers and connects every destination lane', () => {
  const plan = solveProduction(fixture, fixtureInput);
  const layout = generateSupplyLayout(fixture, plan, fixtureTechnology, 2);
  const part = layout.floors.find((floor) => floor.itemId === 'fixture:part')!;
  const feed = layout.floors.find((floor) => floor.itemId === 'fixture:feed')!;
  expect(part.inputs[0]!.lines).toBe(3); // ceil(200/120) alone would be only two.
  expect(feed.output.lines).toBe(4); // three transfer lanes plus direct target.
  expect(feed.transport.collectors).toBe(2);
  const transfer = layout.transfers[0]!;
  const outgoing = feed.transport.nodes.filter(
    (node) => node.terminalId === transfer.id,
  );
  const incoming = part.transport.nodes.filter(
    (node) => node.terminalId === transfer.id,
  );
  expect(outgoing).toHaveLength(3);
  expect(incoming).toHaveLength(3);
  expect(
    outgoing.map((node) =>
      sum(
        feed.transport.edges
          .filter((edge) => edge.to === node.id)
          .map((edge) => edge.rate),
      ).toString(),
    ),
  ).toEqual(
    incoming.map((node) =>
      sum(
        part.transport.edges
          .filter((edge) => edge.from === node.id)
          .map((edge) => edge.rate),
      ).toString(),
    ),
  );
  layout.floors.forEach((floor) => verify(floor.transport, plan));
});

it('mixes every output collector proportionally into every destination lane', () => {
  const mixed: Catalog = {
    ...fixture,
    items: [
      ...fixture.items,
      { id: 'fixture:part2', name: 'Second part', raw: false },
    ],
    recipes: [
      ...fixture.recipes,
      {
        ...fixture.recipes[1]!,
        id: 'fixture:part2-recipe',
        inputs: [{ itemId: 'fixture:feed', quantity: '1' }],
        outputs: [{ itemId: 'fixture:part2', quantity: '1' }],
      },
    ],
  };
  const mixedTechnology = {
    ...fixtureTechnology,
    unlockedRecipes: mixed.recipes.map((recipe) => recipe.id),
  };
  const plan = solveProduction(mixed, {
    ...fixtureInput,
    technology: mixedTechnology,
    recipes: {
      ...fixtureInput.recipes,
      'fixture:part2': 'fixture:part2-recipe',
    },
    targets: [
      { itemId: 'fixture:feed', rate: '105' },
      { itemId: 'fixture:part', rate: '315/4' },
      { itemId: 'fixture:part2', rate: '30' },
    ],
  });
  const layout = generateSupplyLayout(mixed, plan, mixedTechnology, 2);
  const graph = layout.floors.find(
    (floor) => floor.itemId === 'fixture:feed',
  )!.transport;
  const collectors = graph.nodes.filter(
    (node) =>
      node.stage === 'collection' &&
      graph.edges.some(
        (edge) =>
          edge.from === node.id &&
          graph.nodes.find((n) => n.id === edge.to)!.stage === 'delivery',
      ),
  );
  expect(collectors).toHaveLength(2);
  expect(
    collectors.map(
      (node) => graph.edges.find((edge) => edge.from === node.id)!.rate,
    ),
  ).toEqual(['120', '120']);
  const outlets = graph.nodes.filter((node) => node.kind === 'outlet');
  expect(
    outlets.map(
      (node) => graph.edges.find((edge) => edge.to === node.id)!.rate,
    ),
  ).toEqual(['105', '105', '30']);
  for (const collector of collectors) {
    const reached = new Set<string>();
    const queue = [collector.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (reached.has(id)) continue;
      reached.add(id);
      queue.push(
        ...graph.edges
          .filter((edge) => edge.from === id)
          .map((edge) => edge.to),
      );
    }
    expect(outlets.every((node) => reached.has(node.id))).toBe(true);
    // Before merging, each collector's branch contributes half of each demand.
    const branches = graph.edges.filter(
      (edge) =>
        reached.has(edge.from) &&
        graph.nodes.find((node) => node.id === edge.to)!.kind === 'merger' &&
        graph.nodes.find((node) => node.id === edge.to)!.stage === 'delivery',
    );
    expect(branches.map((edge) => edge.rate)).toEqual(['105/2', '105/2', '15']);
  }
  layout.floors.forEach((floor) => verify(floor.transport, plan));
});

it('rejects output mixing that exceeds the bounded collector/destination product', () => {
  const bulk: Catalog = {
    ...fixture,
    recipes: [
      {
        ...fixture.recipes[0]!,
        outputs: [{ itemId: 'fixture:feed', quantity: '60' }],
      },
    ],
  };
  const bulkTechnology = {
    ...fixtureTechnology,
    unlockedRecipes: ['fixture:feed-recipe'],
  };
  const plan = solveProduction(bulk, {
    ...fixtureInput,
    technology: bulkTechnology,
    recipes: { 'fixture:feed': 'fixture:feed-recipe' },
    targets: [{ itemId: 'fixture:feed', rate: '7600' }],
  });
  expect(() => generateSupplyLayout(bulk, plan, bulkTechnology, 0)).toThrow(
    /mixing.*capacity/i,
  );
});

it('preserves every port with uneven rows, side-aware ordering and deterministic JSON', () => {
  const plan = solveProduction(fixture, fixtureInput);
  const variant = {
    schemaVersion: 1,
    pattern: 'fixed',
    inputSide: 'east',
    outputSide: 'west',
    overrides: [],
  };
  const layout = generateSupplyLayout(
    fixture,
    plan,
    fixtureTechnology,
    2,
    variant,
  );
  const part = layout.floors.find((floor) => floor.itemId === 'fixture:part')!;
  expect(part.rowCounts).toEqual([2, 1]);
  const inlets = part.transport.nodes.filter((node) => node.kind === 'inlet');
  const firstFeed = part.transport.edges.find(
    (edge) => edge.from === inlets[0]!.id,
  )!;
  expect(
    part.transport.nodes.find((node) => node.id === firstFeed.to)!.machineId,
  ).toBe(2);
  layout.floors.forEach((floor) => verify(floor.transport, plan));
  expect(
    JSON.stringify(
      generateSupplyLayout(fixture, plan, fixtureTechnology, 2, variant),
    ),
  ).toBe(JSON.stringify(layout));
});

it('keeps a manifold spanning uneven rows in continuous serpentine machine order', () => {
  const highTechnology = { ...technologyAtTier(4), beltTier: 4 };
  const plan = solveProduction(vanillaCatalog, {
    targets: [{ itemId: 'Desc_IronPlate_C', rate: '320' }],
    recipes: availableChoices(highTechnology),
    imports: ['Desc_OreIron_C'],
    technology: highTechnology,
  });
  const forward = [1, 2, 3, 4, 5, 6, 11, 10, 9, 8, 7, 12, 13, 14, 15, 16];
  const reverseColumns = [
    6, 5, 4, 3, 2, 1, 7, 8, 9, 10, 11, 16, 15, 14, 13, 12,
  ];
  const reverseRows = [12, 13, 14, 15, 16, 11, 10, 9, 8, 7, 1, 2, 3, 4, 5, 6];
  const cases = [
    { inputSide: 'west', outputSide: 'east', input: forward, output: forward },
    {
      inputSide: 'east',
      outputSide: 'west',
      input: reverseColumns,
      output: reverseColumns,
    },
    {
      inputSide: 'south',
      outputSide: 'north',
      input: reverseRows,
      output: reverseRows,
    },
  ];
  for (const configuration of cases) {
    const layout = generateSupplyLayout(
      vanillaCatalog,
      plan,
      highTechnology,
      3,
      {
        schemaVersion: 1,
        pattern: 'fixed',
        inputSide: configuration.inputSide,
        outputSide: configuration.outputSide,
        overrides: [],
      },
    );
    const floor = layout.floors.find((f) => f.itemId === 'Desc_IronPlate_C')!;
    expect(floor.rowCounts).toEqual([6, 5, 5]);
    expect(floor.inputs[0]!.lines).toBe(1);
    expect(floor.transport.collectors).toBe(1);
    expect(
      floor.transport.nodes
        .filter((node) => node.kind === 'machine-input')
        .map((node) => node.machineId),
    ).toEqual(configuration.input);
    expect(
      floor.transport.nodes
        .filter((node) => node.kind === 'machine-output')
        .map((node) => node.machineId),
    ).toEqual(configuration.output);
    expect(floor.machines[0]!.y).toBeGreaterThanOrEqual(8 + 3.2);
    expect(
      floor.machines.find((machine) => machine.row === 1)!.y -
        floor.machines[0]!.y,
    ).toBeCloseTo(12.5 + 8 + 3.2 * 2);
    verify(floor.transport, plan);
  }
});

it('uses pipe junctions exclusively for fluid networks and honors exact pipe capacity', () => {
  const fluid: Catalog = {
    ...fixture,
    items: fixture.items.map((item) => ({ ...item, transport: 'pipe' })),
  };
  const plan = solveProduction(fluid, {
    ...fixtureInput,
    targets: fixtureInput.targets.map((target) => ({
      ...target,
      rate: String(Number(target.rate) * 5),
    })),
  });
  const graphs = generateBeltRouting(
    fluid,
    plan,
    fixtureTechnology,
    deriveBuildVariants(plan).transfers,
  );
  graphs.forEach((graph) => {
    verify(graph, plan);
    expect(
      graph.edges.every(
        (edge) => edge.transport === 'pipe' && edge.capacity === '300',
      ),
    ).toBe(true);
    expect(
      graph.nodes.some(
        (node) => node.kind === 'splitter' || node.kind === 'merger',
      ),
    ).toBe(false);
    expect(graph.nodes.some((node) => node.kind === 'pipe-junction')).toBe(
      true,
    );
  });
});

it('supports transport-limited extra machines and rejects incompatible legacy counts', () => {
  const rapid: Catalog = {
    ...fixture,
    recipes: [
      fixture.recipes[0]!,
      { ...fixture.recipes[1]!, durationSeconds: '1/10' },
    ],
  };
  const lowTechnology = { ...fixtureTechnology, beltTier: 1 };
  const plan = solveProduction(rapid, {
    ...fixtureInput,
    technology: lowTechnology,
    targets: [{ itemId: 'fixture:part', rate: '180' }],
  });
  const part = plan.nodes.find((node) => node.itemId === 'fixture:part')!;
  expect(part.machineCount).toBe(4);
  const layout = generateSupplyLayout(rapid, plan, lowTechnology, 3);
  expect(
    layout.floors.find((floor) => floor.itemId === part.itemId)!.inputs[0]!
      .lines,
  ).toBe(4);
  layout.floors.forEach((floor) => verify(floor.transport, plan));
  const invalid = {
    ...plan,
    nodes: plan.nodes.map((node) =>
      node === part ? { ...node, machineCount: 1 } : node,
    ),
  };
  expect(() => generateSupplyLayout(rapid, invalid, lowTechnology, 0)).toThrow(
    /capacity/i,
  );
});
