import { describe, expect, it } from 'vitest';
import type { Catalog } from '../src/domain/catalog.js';
import {
  perfectRatio,
  scaleProduction,
  solveProduction,
  type ProductionInput,
} from '../src/domain/production.js';

// Original arithmetic fixture: these quantities are not game balance data.
function catalog(): Catalog {
  return {
    schemaVersion: 1,
    catalogVersion: 'coproduct-arithmetic-1',
    provenance: {
      kind: 'synthetic',
      source: 'Original coproduct arithmetic fixture',
    },
    items: [
      { id: 'ore', name: 'Ore', raw: true },
      { id: 'a', name: 'A', raw: false },
      { id: 'b', name: 'B', raw: false },
      { id: 'c', name: 'C', raw: false },
      { id: 'd', name: 'D', raw: false },
    ],
    machines: [{ id: 'machine', name: 'Machine' }],
    recipes: [
      {
        id: 'split',
        name: 'A',
        machineId: 'machine',
        durationSeconds: '60',
        inputs: [{ itemId: 'ore', quantity: '1' }],
        outputs: [
          { itemId: 'a', quantity: '2' },
          { itemId: 'b', quantity: '3' },
        ],
      },
      {
        id: 'finish',
        name: 'C',
        machineId: 'machine',
        durationSeconds: '30',
        inputs: [{ itemId: 'b', quantity: '2' }],
        outputs: [{ itemId: 'c', quantity: '1' }],
      },
    ],
  };
}
function input(targets = [{ itemId: 'a', rate: '2' }]): ProductionInput {
  return {
    targets,
    recipes: { a: 'split', b: 'split', c: 'finish' },
    imports: ['ore'],
  };
}

describe('selected coproduct balance', () => {
  it('executes one recipe once for unequal demand on both outputs', () => {
    const plan = solveProduction(
      catalog(),
      input([
        { itemId: 'a', rate: '2' },
        { itemId: 'b', rate: '9' },
      ]),
    );
    expect(plan.nodes).toEqual([
      {
        itemId: 'a',
        rate: '6',
        recipeId: 'split',
        machineId: 'machine',
        craftsPerMinute: '3',
        machineCount: 3,
        utilization: '1',
        inputs: [{ itemId: 'ore', rate: '3' }],
        outputs: [
          { itemId: 'a', rate: '6' },
          { itemId: 'b', rate: '9' },
        ],
      },
    ]);
    expect(plan.imports).toEqual([{ itemId: 'ore', rate: '3' }]);
    expect(plan.surplus).toEqual([{ itemId: 'a', rate: '4' }]);
  });

  it('uses residue in a downstream recipe and increases the coproduct recipe for its demand', () => {
    const plan = solveProduction(
      catalog(),
      input([
        { itemId: 'a', rate: '2' },
        { itemId: 'c', rate: '3' },
      ]),
    );
    expect(
      plan.nodes.map((node) => [node.recipeId, node.craftsPerMinute]),
    ).toEqual([
      ['split', '2'],
      ['finish', '3'],
    ]);
    expect(plan.imports).toEqual([{ itemId: 'ore', rate: '2' }]);
    expect(plan.surplus).toEqual([{ itemId: 'a', rate: '2' }]);
  });

  it('accepts an unselected output only when a reachable selected recipe supplies it', () => {
    const request = input([
      { itemId: 'a', rate: '2' },
      { itemId: 'c', rate: '3' },
    ]);
    delete request.recipes.b;
    expect(solveProduction(catalog(), request).surplus).toEqual([
      { itemId: 'a', rate: '2' },
    ]);
    expect(() =>
      solveProduction(catalog(), {
        ...request,
        targets: [{ itemId: 'c', rate: '1' }],
      }),
    ).toThrow(/explicit.*recipe.*b/i);
  });

  it('credits shared coproduct supplies globally and omits zero execution recipes', () => {
    const data = catalog();
    data.recipes[0]!.outputs = [
      { itemId: 'a', quantity: '1' },
      { itemId: 'b', quantity: '1' },
    ];
    data.recipes[1]!.inputs = [{ itemId: 'b', quantity: '1' }];
    data.recipes.push(
      {
        id: 'second',
        name: 'D',
        machineId: 'machine',
        durationSeconds: '60',
        inputs: [{ itemId: 'ore', quantity: '2' }],
        outputs: [
          { itemId: 'd', quantity: '1' },
          { itemId: 'b', quantity: '1' },
        ],
      },
      {
        id: 'only-b',
        name: 'B',
        machineId: 'machine',
        durationSeconds: '60',
        inputs: [{ itemId: 'ore', quantity: '1' }],
        outputs: [{ itemId: 'b', quantity: '1' }],
      },
    );
    const request = input([
      { itemId: 'a', rate: '2' },
      { itemId: 'd', rate: '3' },
      { itemId: 'c', rate: '4' },
    ]);
    request.recipes.b = 'only-b';
    request.recipes.d = 'second';
    const plan = solveProduction(data, request);
    expect(
      plan.nodes.map((node) => [node.recipeId, node.craftsPerMinute]),
    ).toEqual([
      ['split', '2'],
      ['finish', '4'],
      ['second', '3'],
    ]);
    expect(plan.imports).toEqual([{ itemId: 'ore', rate: '8' }]);
    expect(plan.surplus).toEqual([{ itemId: 'b', rate: '1' }]);
  });

  it('does not activate unrelated selected recipes to optimize the factory', () => {
    const request = input();
    request.recipes.c = 'finish';
    expect(
      solveProduction(catalog(), request).nodes.map((node) => node.recipeId),
    ).toEqual(['split']);
  });

  it('scales aggregate coproduct output anchors and surplus exactly', () => {
    const request = input([
      { itemId: 'a', rate: '2' },
      { itemId: 'c', rate: '3' },
    ]);
    const plan = scaleProduction(catalog(), request, {
      itemId: 'b',
      rate: '1',
    });
    expect(plan.targets).toEqual([
      { itemId: 'a', rate: '1/3' },
      { itemId: 'c', rate: '1/2' },
    ]);
    expect(plan.imports).toEqual([{ itemId: 'ore', rate: '1/3' }]);
    expect(plan.surplus).toEqual([{ itemId: 'a', rate: '1/3' }]);
  });

  it('computes Perfect Ratio from deduplicated recipe machines', () => {
    const plan = perfectRatio(
      catalog(),
      input([
        { itemId: 'a', rate: '1' },
        { itemId: 'c', rate: '1' },
      ]),
    );
    expect(plan.targets).toEqual([
      { itemId: 'a', rate: '6' },
      { itemId: 'c', rate: '6' },
    ]);
    expect(
      plan.nodes.map((node) => [
        node.recipeId,
        node.machineCount,
        node.utilization,
      ]),
    ).toEqual([
      ['split', 4, '1'],
      ['finish', 3, '1'],
    ]);
    expect(plan.surplus).toEqual([{ itemId: 'a', rate: '2' }]);
  });

  it('applies transport capacity to every output, including unused surplus', () => {
    const data = catalog();
    data.recipes[0]!.outputs[1]!.quantity = '601';
    const request = input();
    request.technology = {
      availableMachines: ['machine'],
      unlockedRecipes: ['split', 'finish'],
      beltTier: 1,
      pipeTier: 1,
    };
    const plan = solveProduction(data, request);
    expect(plan.nodes[0]).toMatchObject({
      machineCount: 11,
      utilization: '1/11',
    });
    expect(() => perfectRatio(data, request)).toThrow(/transport capacity/i);
    request.technology.unlockedRecipes = [];
    expect(() => solveProduction(data, request)).toThrow(/freigeschaltet/);
  });

  it('recycles raw coproduct output before importing the remaining deficit', () => {
    const data = catalog();
    data.recipes[0]!.inputs[0]!.quantity = '3';
    data.recipes[0]!.outputs.push({ itemId: 'ore', quantity: '1' });
    const plan = solveProduction(data, input());
    expect(plan.imports).toEqual([{ itemId: 'ore', rate: '2' }]);
    expect(plan.nodes[0]!.inputs).toEqual([{ itemId: 'ore', rate: '3' }]);
    expect(plan.nodes[0]!.outputs).toContainEqual({ itemId: 'ore', rate: '1' });
    expect(() => solveProduction(data, { ...input(), imports: [] })).toThrow(
      /explicit import/i,
    );
  });

  it('scales raw anchors by net imports when raw coproducts are recycled', () => {
    const data = catalog();
    data.recipes[0]!.inputs[0]!.quantity = '3';
    data.recipes[0]!.outputs.push({ itemId: 'ore', quantity: '1' });
    const plan = scaleProduction(data, input(), { itemId: 'ore', rate: '4' });
    expect(plan.targets).toEqual([{ itemId: 'a', rate: '4' }]);
    expect(plan.imports).toEqual([{ itemId: 'ore', rate: '4' }]);
  });

  it('uses the named selected product as its canonical output independently of lexical order', () => {
    const data = catalog();
    data.recipes[0]!.name = 'B';
    const plan = solveProduction(data, input());
    expect(plan.nodes[0]).toMatchObject({ itemId: 'b', rate: '3' });
  });

  it('is invariant to all catalog, selection, target and output permutations', () => {
    const data = catalog();
    const request = input([
      { itemId: 'a', rate: '2' },
      { itemId: 'b', rate: '3' },
      { itemId: 'c', rate: '3' },
    ]);
    const expected = solveProduction(data, request);
    data.items.reverse();
    data.recipes.reverse();
    for (const recipe of data.recipes) {
      recipe.inputs.reverse();
      recipe.outputs.reverse();
    }
    request.targets.reverse();
    request.recipes = Object.fromEntries(
      Object.entries(request.recipes).reverse(),
    );
    expect(solveProduction(data, request)).toEqual(expected);
  });

  it('rejects a nonraw flow cycle hidden by a zero-execution fallback recipe', () => {
    const data = catalog();
    data.recipes = [
      {
        id: 'left',
        name: 'A',
        machineId: 'machine',
        durationSeconds: '60',
        inputs: [{ itemId: 'b', quantity: '1' }],
        outputs: [
          { itemId: 'a', quantity: '1' },
          { itemId: 'c', quantity: '1' },
        ],
      },
      {
        id: 'right',
        name: 'D',
        machineId: 'machine',
        durationSeconds: '60',
        inputs: [{ itemId: 'c', quantity: '1' }],
        outputs: [
          { itemId: 'd', quantity: '1' },
          { itemId: 'b', quantity: '1' },
        ],
      },
      {
        id: 'fallback',
        name: 'B',
        machineId: 'machine',
        durationSeconds: '60',
        inputs: [{ itemId: 'ore', quantity: '1' }],
        outputs: [{ itemId: 'b', quantity: '1' }],
      },
    ];
    const request = {
      targets: [
        { itemId: 'a', rate: '1' },
        { itemId: 'd', rate: '1' },
      ],
      recipes: { a: 'left', d: 'right', b: 'fallback' },
      imports: ['ore'],
    };
    expect(() => solveProduction(data, request)).toThrow(/cycle/i);
  });

  it('keeps a rooted acyclic allocation when a later coproduct can be left as surplus', () => {
    const data = catalog();
    data.items.push({ id: 'e', name: 'E', raw: false });
    data.recipes = [
      {
        id: 'left',
        name: 'A',
        machineId: 'machine',
        durationSeconds: '60',
        inputs: [{ itemId: 'b', quantity: '1' }],
        outputs: [
          { itemId: 'a', quantity: '1' },
          { itemId: 'c', quantity: '1' },
        ],
      },
      {
        id: 'right',
        name: 'D',
        machineId: 'machine',
        durationSeconds: '60',
        inputs: [{ itemId: 'c', quantity: '1' }],
        outputs: [
          { itemId: 'd', quantity: '1' },
          { itemId: 'b', quantity: '1' },
        ],
      },
      {
        id: 'root',
        name: 'E',
        machineId: 'machine',
        durationSeconds: '60',
        inputs: [{ itemId: 'ore', quantity: '1' }],
        outputs: [
          { itemId: 'e', quantity: '1' },
          { itemId: 'b', quantity: '1' },
        ],
      },
    ];
    const request = {
      targets: [
        { itemId: 'a', rate: '1' },
        { itemId: 'd', rate: '1' },
        { itemId: 'e', rate: '1' },
      ],
      recipes: { a: 'left', d: 'right', b: 'root', e: 'root' },
      imports: ['ore'],
    };
    const plan = solveProduction(data, request);
    expect(plan.nodes.map((node) => node.craftsPerMinute)).toEqual([
      '1',
      '1',
      '1',
    ]);
    expect(plan.surplus).toEqual([{ itemId: 'b', rate: '1' }]);
  });

  it('requires explicit raw imports and rejects cyclic and excessive coproduct plans', () => {
    expect(() =>
      solveProduction(catalog(), { ...input(), imports: [] }),
    ).toThrow(/explicit import/i);
    expect(() =>
      solveProduction(catalog(), input([{ itemId: 'a', rate: '2000002' }])),
    ).toThrow(/machine.*limit/i);
    const data = catalog();
    data.recipes[0]!.inputs = [{ itemId: 'c', quantity: '1' }];
    expect(() => solveProduction(data, input())).toThrow(/cycle/i);
  });
});
