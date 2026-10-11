import { describe, expect, it } from 'vitest';
import { syntheticCatalog, type Catalog } from '../src/domain/catalog';
import { Rational } from '../src/domain/rational';
import {
  perfectRatio,
  scaleProduction,
  solveProduction,
  type ProductionInput,
} from '../src/domain/production';

const choices = {
  'example:ingot': 'example:smelt',
  'example:plate': 'example:press',
  'example:rod': 'example:shape',
};
const input = (
  targets = [{ itemId: 'example:plate', rate: '30' }],
): ProductionInput => ({ targets, recipes: choices, imports: ['example:ore'] });
const fixture = (): Catalog => structuredClone(syntheticCatalog);

describe('selected recipe production DAG', () => {
  it('solves a tiny catalog duration after canonical normalization', () => {
    const catalog = fixture();
    catalog.recipes[0]!.durationSeconds = `0.${'0'.repeat(58)}1`;
    const plan = solveProduction(
      catalog,
      input([{ itemId: 'example:ingot', rate: '1' }]),
    );
    expect(plan.nodes[0]).toMatchObject({
      machineCount: 1,
      utilization: `1/${60n * 10n ** 59n}`,
    });
  });
  it('solves a known plate chain with independently calculated rates and machine counts', () => {
    const plan = solveProduction(syntheticCatalog, input());
    expect(plan).toEqual({
      schemaVersion: 1,
      catalogVersion: syntheticCatalog.catalogVersion,
      targets: [{ itemId: 'example:plate', rate: '30' }],
      nodes: [
        {
          itemId: 'example:ingot',
          recipeId: 'example:smelt',
          machineId: 'example:kiln',
          rate: '45',
          craftsPerMinute: '45',
          machineCount: 5,
          utilization: '9/10',
          inputs: [{ itemId: 'example:ore', rate: '45' }],
        },
        {
          itemId: 'example:plate',
          recipeId: 'example:press',
          machineId: 'example:press-machine',
          rate: '30',
          craftsPerMinute: '15',
          machineCount: 2,
          utilization: '3/4',
          inputs: [{ itemId: 'example:ingot', rate: '45' }],
        },
      ],
      imports: [{ itemId: 'example:ore', rate: '45' }],
    });
    expect(() => JSON.stringify(plan)).not.toThrow();
  });
  it('aggregates shared ingots across multiple targets before rounding machines', () => {
    const plan = solveProduction(
      syntheticCatalog,
      input([
        { itemId: 'example:plate', rate: '1' },
        { itemId: 'example:rod', rate: '1' },
      ]),
    );
    expect(
      plan.nodes.find((node) => node.itemId === 'example:ingot'),
    ).toMatchObject({ rate: '5/2', machineCount: 1, utilization: '1/4' });
    expect(plan.imports).toEqual([{ itemId: 'example:ore', rate: '5/2' }]);
  });
  it('preserves fractional demand and rounds partial machines upward', () => {
    const plan = solveProduction(
      syntheticCatalog,
      input([{ itemId: 'example:plate', rate: '1/3' }]),
    );
    expect(
      plan.nodes.find((node) => node.itemId === 'example:plate'),
    ).toMatchObject({
      rate: '1/3',
      craftsPerMinute: '1/6',
      machineCount: 1,
      utilization: '1/60',
    });
    expect(plan.imports).toEqual([{ itemId: 'example:ore', rate: '1/2' }]);
  });
  it('is invariant to target, catalog and selected recipe ordering', () => {
    const a = input([
      { itemId: 'example:plate', rate: '4' },
      { itemId: 'example:rod', rate: '7' },
    ]);
    const c = fixture();
    c.items.reverse();
    c.recipes.reverse();
    c.machines.reverse();
    const b = {
      ...a,
      targets: [...a.targets].reverse(),
      recipes: Object.fromEntries(Object.entries(a.recipes).reverse()),
    };
    expect(solveProduction(c, b)).toEqual(solveProduction(syntheticCatalog, a));
  });
  it('aggregates duplicate target rows and direct demands for a dependency', () => {
    const plan = solveProduction(
      syntheticCatalog,
      input([
        { itemId: 'example:plate', rate: '1' },
        { itemId: 'example:plate', rate: '2' },
        { itemId: 'example:ingot', rate: '5' },
      ]),
    );
    expect(plan.targets).toEqual([
      { itemId: 'example:ingot', rate: '5' },
      { itemId: 'example:plate', rate: '3' },
    ]);
    expect(plan.imports).toEqual([{ itemId: 'example:ore', rate: '19/2' }]);
  });
  it('imports direct raw target demand', () => {
    expect(
      solveProduction(
        syntheticCatalog,
        input([{ itemId: 'example:ore', rate: '2.5' }]),
      ).imports,
    ).toEqual([{ itemId: 'example:ore', rate: '5/2' }]);
  });
  it('diagnoses a selected dependency cycle', () => {
    const c = fixture();
    c.recipes[0]!.inputs = [{ itemId: 'example:plate', quantity: '1' }];
    expect(() => solveProduction(c, input())).toThrow(/cycle.*example:/i);
  });
  it('diagnoses selected coproduct recipes', () => {
    const c = fixture();
    c.recipes[0]!.outputs.push({ itemId: 'example:rod', quantity: '1' });
    expect(() => solveProduction(c, input())).toThrow(
      /coproduct|single.output/i,
    );
  });
  it.each([
    [
      'negative rate',
      { ...input(), targets: [{ itemId: 'example:plate', rate: '-1' }] },
      /positive/i,
    ],
    [
      'zero rate',
      { ...input(), targets: [{ itemId: 'example:plate', rate: '0' }] },
      /positive/i,
    ],
    [
      'malformed rate',
      { ...input(), targets: [{ itemId: 'example:plate', rate: '1e3' }] },
      /rational|number/i,
    ],
    ['missing choice', { ...input(), recipes: {} }, /choose|choice|selected/i],
    [
      'incorrect choice output',
      { ...input(), recipes: { ...choices, 'example:plate': 'example:shape' } },
      /output/i,
    ],
    [
      'unknown target',
      { ...input(), targets: [{ itemId: 'missing', rate: '1' }] },
      /unknown.*item/i,
    ],
    ['missing explicit raw import', { ...input(), imports: [] }, /import/i],
    [
      'manufactured item import',
      { ...input(), imports: ['example:plate'] },
      /raw/i,
    ],
    ['unknown import', { ...input(), imports: ['missing'] }, /unknown.*item/i],
    [
      'huge rate',
      {
        ...input(),
        targets: [{ itemId: 'example:plate', rate: '9'.repeat(61) }],
      },
      /limit|bound/i,
    ],
    [
      'too many machines',
      {
        ...input(),
        targets: [{ itemId: 'example:plate', rate: '1000000000' }],
      },
      /machine.*limit|bound/i,
    ],
  ])('rejects %s', (_name, request, diagnostic) => {
    expect(() => solveProduction(syntheticCatalog, request)).toThrow(
      diagnostic,
    );
  });
  it('rejects empty and malformed production requests', () => {
    expect(() =>
      solveProduction(syntheticCatalog, { ...input(), targets: [] }),
    ).toThrow(/targets/i);
    expect(() =>
      solveProduction(syntheticCatalog, null as unknown as ProductionInput),
    ).toThrow(/input/i);
  });
  it('rejects unsupported production modifiers rather than ignoring them', () => {
    expect(() =>
      solveProduction(syntheticCatalog, {
        ...input(),
        power: '100',
      } as ProductionInput),
    ).toThrow(/unsupported.*power/i);
    const request = input();
    Object.assign(request.targets[0]!, { amplification: '2' });
    expect(() => solveProduction(syntheticCatalog, request)).toThrow(
      /unsupported.*amplification/i,
    );
  });
  it('does not silently use imports when a recipe choice produces a raw item', () => {
    const catalog = fixture();
    catalog.recipes.push({
      id: 'example:raw-recipe',
      name: 'Raw recipe',
      machineId: 'example:kiln',
      durationSeconds: '1',
      inputs: [],
      outputs: [{ itemId: 'example:ore', quantity: '1' }],
    });
    const request = {
      ...input(),
      recipes: { ...choices, 'example:ore': 'example:raw-recipe' },
    };
    expect(() => solveProduction(catalog, request)).toThrow(
      /raw.*import|raw.*choice/i,
    );
  });
});

describe('whole-chain scale and Perfect Ratio', () => {
  it('preserves a computed scaled target larger than external input digit limits', () => {
    const denominator = 9n * 10n ** 58n;
    const plan = scaleProduction(
      syntheticCatalog,
      input([{ itemId: 'example:plate', rate: '1' }]),
      { itemId: 'example:ingot', rate: `1/${denominator}` },
    );
    expect(plan.targets).toEqual([
      { itemId: 'example:plate', rate: `1/${(3n * denominator) / 2n}` },
    ]);
    expect(plan.nodes.every((node) => node.machineCount === 1)).toBe(true);
  });
  it('scales a valid tiny demand despite an internal anchor exceeding input digit bounds', () => {
    const request = input([
      { itemId: 'example:plate', rate: `1/${2n ** 195n}` },
    ]);
    expect(solveProduction(syntheticCatalog, request).nodes).toHaveLength(2);
    expect(
      scaleProduction(syntheticCatalog, request, {
        itemId: 'example:ingot',
        rate: '30',
      }),
    ).toEqual(
      solveProduction(
        syntheticCatalog,
        input([{ itemId: 'example:plate', rate: '20' }]),
      ),
    );
  });
  it('finds a valid Perfect Ratio despite computed utilization and factor exceeding input digit bounds', () => {
    const request = input([
      { itemId: 'example:plate', rate: `1/${2n ** 195n}` },
    ]);
    expect(perfectRatio(syntheticCatalog, request)).toEqual(
      solveProduction(
        syntheticCatalog,
        input([{ itemId: 'example:plate', rate: '20' }]),
      ),
    );
  });
  it('scales duplicate targets whose normalized sum exceeds external input bounds', () => {
    const base = 10n ** 58n;
    const request = input([
      { itemId: 'example:plate', rate: `1/${base + 7n}` },
      { itemId: 'example:plate', rate: `1/${base + 9n}` },
    ]);
    const plan = solveProduction(syntheticCatalog, request);
    expect(() => Rational.parse(plan.targets[0]!.rate)).toThrow(/input.*bound/);
    const expected = solveProduction(
      syntheticCatalog,
      input([{ itemId: 'example:plate', rate: '20' }]),
    );
    expect(
      scaleProduction(syntheticCatalog, request, {
        itemId: 'example:plate',
        rate: '20',
      }),
    ).toEqual(expected);
    expect(perfectRatio(syntheticCatalog, request)).toEqual(expected);
  });
  it('scales every target from a selected shared stage rate', () => {
    const request = input([
      { itemId: 'example:plate', rate: '1' },
      { itemId: 'example:rod', rate: '1' },
    ]);
    const plan = scaleProduction(syntheticCatalog, request, {
      itemId: 'example:ingot',
      rate: '10',
    });
    expect(plan.targets).toEqual([
      { itemId: 'example:plate', rate: '4' },
      { itemId: 'example:rod', rate: '4' },
    ]);
    expect(plan.imports).toEqual([{ itemId: 'example:ore', rate: '10' }]);
  });
  it('scales from imported raw demand with an exact fractional factor', () => {
    const plan = scaleProduction(syntheticCatalog, input(), {
      itemId: 'example:ore',
      rate: '1',
    });
    expect(plan.targets).toEqual([{ itemId: 'example:plate', rate: '2/3' }]);
    expect(plan.imports).toEqual([{ itemId: 'example:ore', rate: '1' }]);
  });
  it('rejects missing and nonpositive scale anchors', () => {
    expect(() =>
      scaleProduction(syntheticCatalog, input(), {
        itemId: 'example:rod',
        rate: '1',
      }),
    ).toThrow(/anchor.*missing|not.*plan/i);
    expect(() =>
      scaleProduction(syntheticCatalog, input(), {
        itemId: 'example:plate',
        rate: '0',
      }),
    ).toThrow(/positive/i);
    expect(() =>
      scaleProduction(syntheticCatalog, input(), {
        itemId: 'example:plate',
        rate: '-1',
      }),
    ).toThrow(/positive/i);
  });
  it('uses the smallest rational upscale that produces full machines', () => {
    const plan = perfectRatio(syntheticCatalog, input());
    expect(plan.targets).toEqual([{ itemId: 'example:plate', rate: '40' }]);
    expect(
      plan.nodes.map((node) => [
        node.recipeId,
        node.machineCount,
        node.utilization,
      ]),
    ).toEqual([
      ['example:smelt', 6, '1'],
      ['example:press', 2, '1'],
    ]);
  });
  it('respects selected building multiples exactly', () => {
    const plan = perfectRatio(syntheticCatalog, input(), {
      multiples: { 'example:smelt': 2, 'example:press': 4 },
    });
    expect(plan.targets).toEqual([{ itemId: 'example:plate', rate: '80' }]);
    expect(
      plan.nodes.map((node) => [node.machineCount, node.utilization]),
    ).toEqual([
      [12, '1'],
      [4, '1'],
    ]);
  });
  it('finds a rational factor for 1.2 and 2.4 exact machines', () => {
    const catalog = fixture();
    catalog.recipes[0]!.durationSeconds = '1';
    const plan = perfectRatio(
      catalog,
      input([{ itemId: 'example:plate', rate: '48' }]),
    );
    expect(plan.targets).toEqual([{ itemId: 'example:plate', rate: '80' }]);
    expect(
      plan.nodes.map((node) => [node.machineCount, node.utilization]),
    ).toEqual([
      [2, '1'],
      [4, '1'],
    ]);
  });
  it('keeps target proportions and raw-only plans unchanged', () => {
    const plan = perfectRatio(
      syntheticCatalog,
      input([
        { itemId: 'example:plate', rate: '1' },
        { itemId: 'example:rod', rate: '2' },
      ]),
    );
    const targets = new Map(
      plan.targets.map((target) => [
        target.itemId,
        Rational.parse(target.rate),
      ]),
    );
    expect(
      targets
        .get('example:rod')!
        .divide(targets.get('example:plate')!)
        .toString(),
    ).toBe('2');
    expect(plan.nodes.every((node) => node.utilization === '1')).toBe(true);
    const raw = input([{ itemId: 'example:ore', rate: '1/3' }]);
    expect(perfectRatio(syntheticCatalog, raw)).toEqual(
      solveProduction(syntheticCatalog, raw),
    );
  });
  it('diagnoses invalid building multiples and stage constraints', () => {
    for (const multiple of [0, -1, 1.5, 1000001]) {
      expect(() =>
        perfectRatio(syntheticCatalog, input(), {
          multiples: { 'example:press': multiple },
        }),
      ).toThrow(/multiple|bound/i);
    }
    expect(() =>
      perfectRatio(syntheticCatalog, input(), {
        multiples: { 'example:shape': 2 },
      }),
    ).toThrow(/inactive|not.*plan/i);
    expect(() =>
      perfectRatio(syntheticCatalog, input(), {
        multiples: { 'example:press': 1000000 },
      }),
    ).toThrow(/machine.*limit|bound/i);
  });
  it('rejects unsupported scale and ratio options', () => {
    expect(() =>
      scaleProduction(syntheticCatalog, input(), {
        itemId: 'example:plate',
        rate: '1',
        maximumPower: '100',
      } as { itemId: string; rate: string }),
    ).toThrow(/unsupported.*maximumPower/i);
    expect(() =>
      perfectRatio(syntheticCatalog, input(), { fixed: true } as {
        multiples?: Record<string, number>;
      }),
    ).toThrow(/unsupported.*fixed/i);
  });
});
