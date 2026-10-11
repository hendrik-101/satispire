import { describe, expect, it } from 'vitest';
import {
  allocateManual,
  underclockAutomatic,
  maximizeThroughput,
  type ClockRules,
  type ClockContext,
  type ShardBudget,
} from '../src/domain/clocking';

// Original synthetic arithmetic examples; none of these values describe the game.
const rules = (): ClockRules => ({
  schemaVersion: 1,
  datasetVersion: 'synthetic-clock-v1',
  provenance: 'synthetic',
  minClock: '1/4',
  maxClock: '3',
  baseMaxClock: '1',
  shardSlots: 2,
  shardEffect: { kind: 'increment', perShard: '1/2' },
});
const context: ClockContext = {
  expectedDatasetVersion: 'synthetic-clock-v1',
  allowSynthetic: true,
};
const budget = (amount: number): ShardBudget => ({
  resource: 'power-shard',
  amount,
});

describe('explicit clock and Power Shard allocation', () => {
  it('preserves exact computed clocks beyond the external numeric input length bound', () => {
    const tinyMinimum = { ...rules(), minClock: `1/1${'0'.repeat(58)}` };
    const result = underclockAutomatic(
      {
        baseRate: '9'.repeat(60),
        machineShards: [0],
        targetRate: '100',
        budget: budget(0),
      },
      tinyMinimum,
      context,
    );
    expect(result.totalRate).toBe('100');
    expect(result.machines[0]!.clock).toBe(`100/${'9'.repeat(60)}`);
  });
  it('computes manual exact rates with one representing 100 percent', () => {
    const result = allocateManual(
      {
        baseRate: '1/3',
        machines: [
          { clock: '0.5', shards: 0 },
          { clock: '1.5', shards: 1 },
        ],
        budget: budget(2),
      },
      rules(),
      context,
    );
    expect(result).toMatchObject({
      totalClock: '2',
      totalRate: '2/3',
      shardsUsed: 1,
      shardsRemaining: 1,
      energy: { status: 'unknown' },
    });
    expect(result.machines).toEqual([
      { clock: '1/2', shards: 0, rate: '1/6', maxClock: '1' },
      { clock: '3/2', shards: 1, rate: '1/2', maxClock: '3/2' },
    ]);
    expect(() => JSON.stringify(result)).not.toThrow();
  });
  it('rejects overclocking without the explicitly assigned shards', () => {
    expect(() =>
      allocateManual(
        {
          baseRate: '10',
          machines: [{ clock: '3/2', shards: 0 }],
          budget: budget(2),
        },
        rules(),
        context,
      ),
    ).toThrow(/clock.*maximum/i);
  });
  it('rejects manual clocks below the minimum and above the global maximum', () => {
    for (const clock of ['0', '-1', '1/5', '4']) {
      expect(() =>
        allocateManual(
          {
            baseRate: '10',
            machines: [{ clock, shards: 2 }],
            budget: budget(2),
          },
          rules(),
          context,
        ),
      ).toThrow(/below.*minimum|above.*maximum/i);
    }
  });
  it('rejects overspending across machines', () => {
    expect(() =>
      allocateManual(
        {
          baseRate: '10',
          machines: [
            { clock: '1', shards: 1 },
            { clock: '1', shards: 1 },
          ],
          budget: budget(1),
        },
        rules(),
        context,
      ),
    ).toThrow(/budget/i);
  });
  it.each([-1, 0.5, 3, NaN])(
    'rejects invalid per-machine shard count %s',
    (shards) => {
      expect(() =>
        allocateManual(
          {
            baseRate: '10',
            machines: [{ clock: '1', shards }],
            budget: budget(4),
          },
          rules(),
          context,
        ),
      ).toThrow(/shard/i);
    },
  );
  it('accepts zero shard budget and zero shard slots', () => {
    const result = maximizeThroughput(
      { baseRate: '10', machineCount: 2, budget: budget(0) },
      { ...rules(), shardSlots: 0 },
      context,
    );
    expect(result.totalRate).toBe('20');
    expect(result.shardsUsed).toBe(0);
  });
  it('rejects slugs as a budget and does not infer a conversion', () => {
    expect(() =>
      maximizeThroughput(
        {
          baseRate: '10',
          machineCount: 2,
          budget: {
            resource: 'power-slug',
            amount: 3,
          } as unknown as ShardBudget,
        },
        rules(),
        context,
      ),
    ).toThrow(/power.shard|slug/i);
    expect(() =>
      maximizeThroughput(
        {
          baseRate: '10',
          machineCount: 2,
          budget: budget(3),
          slugBudget: 5,
        } as Parameters<typeof maximizeThroughput>[0],
        rules(),
        context,
      ),
    ).toThrow(/slug/i);
  });
  it('automatically reaches a fractional target with fixed machines and assigned shards', () => {
    const result = underclockAutomatic(
      {
        baseRate: '10',
        machineShards: [1, 0],
        targetRate: '25/3',
        budget: budget(1),
      },
      rules(),
      context,
    );
    expect(result.totalRate).toBe('25/3');
    expect(result.machines.map((machine) => machine.clock)).toEqual([
      '7/12',
      '1/4',
    ]);
    expect(result.machines.map((machine) => machine.shards)).toEqual([1, 0]);
  });
  it.each(['0', '-1', '4', '26'])(
    'rejects unattainable target %s for the fixed machine count',
    (targetRate) => {
      expect(() =>
        underclockAutomatic(
          {
            baseRate: '10',
            machineShards: [1, 0],
            targetRate,
            budget: budget(1),
          },
          rules(),
          context,
        ),
      ).toThrow(/target|attainable/i);
    },
  );
  it('does not overspend in automatic underclocking', () => {
    expect(() =>
      underclockAutomatic(
        {
          baseRate: '10',
          machineShards: [1, 1],
          targetRate: '10',
          budget: budget(1),
        },
        rules(),
        context,
      ),
    ).toThrow(/budget/i);
  });
  it('enumerates table choices to maximize the selected stage rather than greedily choosing the next shard', () => {
    const table: ClockRules = {
      ...rules(),
      shardEffect: { kind: 'table', maxClockByShard: ['1', '11/10', '3'] },
    };
    const result = maximizeThroughput(
      { baseRate: '10', machineCount: 2, budget: budget(2) },
      table,
      context,
    );
    expect(result.totalRate).toBe('40');
    expect(result.machines.map((machine) => machine.shards)).toEqual([2, 0]);
    expect(result.shardsUsed).toBe(2);
    expect(
      maximizeThroughput(
        { baseRate: '10', machineCount: 2, budget: budget(2) },
        table,
        context,
      ),
    ).toEqual(result);
  });
  it('never decreases throughput as shard budget increases and never overspends', () => {
    let previous = 0;
    for (let amount = 0; amount <= 8; amount++) {
      const result = maximizeThroughput(
        { baseRate: '10', machineCount: 3, budget: budget(amount) },
        rules(),
        context,
      );
      expect(Number(result.totalRate)).toBeGreaterThanOrEqual(previous);
      expect(result.shardsUsed).toBeLessThanOrEqual(amount);
      expect(result.machines).toHaveLength(3);
      expect(result.machines.every((machine) => machine.shards <= 2)).toBe(
        true,
      );
      previous = Number(result.totalRate);
    }
    expect(previous).toBe(60);
  });
  it('avoids wasting shards when clocks hit the explicit global ceiling', () => {
    const capped = { ...rules(), maxClock: '3/2' };
    const result = maximizeThroughput(
      { baseRate: '10', machineCount: 2, budget: budget(4) },
      capped,
      context,
    );
    expect(result.totalRate).toBe('30');
    expect(result.shardsUsed).toBe(2);
  });
  it('rejects stale, unverified, unsupported and implicitly opted-in synthetic rules', () => {
    const request = { baseRate: '10', machineCount: 1, budget: budget(0) };
    expect(() =>
      maximizeThroughput(
        request,
        { ...rules(), datasetVersion: 'old' },
        context,
      ),
    ).toThrow(/version|stale/i);
    expect(() =>
      maximizeThroughput(
        request,
        { ...rules(), provenance: 'unverified' },
        context,
      ),
    ).toThrow(/unverified/i);
    expect(() =>
      maximizeThroughput(
        request,
        { ...rules(), schemaVersion: 2 } as unknown as ClockRules,
        context,
      ),
    ).toThrow(/schema|version/i);
    expect(() =>
      maximizeThroughput(request, rules(), {
        expectedDatasetVersion: context.expectedDatasetVersion,
      }),
    ).toThrow(/synthetic/i);
  });
  it.each([
    { minClock: '0' },
    { minClock: '-1' },
    { maxClock: '0' },
    { baseMaxClock: '0' },
    { minClock: '2' },
    { shardSlots: -1 },
    { shardSlots: 0.5 },
    { shardSlots: 33 },
    { shardEffect: { kind: 'increment' as const, perShard: '-1' } },
    { shardEffect: { kind: 'table' as const, maxClockByShard: ['1'] } },
    {
      shardEffect: { kind: 'table' as const, maxClockByShard: ['2', '2', '3'] },
    },
    {
      shardEffect: { kind: 'table' as const, maxClockByShard: ['1', '0', '3'] },
    },
  ])('rejects inconsistent or invalid rule limits %j', (patch) => {
    expect(() =>
      maximizeThroughput(
        { baseRate: '10', machineCount: 1, budget: budget(0) },
        { ...rules(), ...patch },
        context,
      ),
    ).toThrow(/rule|clock|shard|table|limit/i);
  });
  it.each([0, -1, 1.5, 129, NaN])(
    'rejects invalid or unbounded machine count %s',
    (machineCount) => {
      expect(() =>
        maximizeThroughput(
          { baseRate: '10', machineCount, budget: budget(0) },
          rules(),
          context,
        ),
      ).toThrow(/machine|limit/i);
    },
  );
  it.each([-1, 0.5, 513, NaN])(
    'rejects invalid or unbounded budget %s',
    (amount) => {
      expect(() =>
        maximizeThroughput(
          { baseRate: '10', machineCount: 1, budget: budget(amount) },
          rules(),
          context,
        ),
      ).toThrow(/budget|limit/i);
    },
  );
  it.each(['0', '-1', '1e3', '9'.repeat(61)])(
    'rejects invalid base rate %s',
    (baseRate) => {
      expect(() =>
        maximizeThroughput(
          { baseRate, machineCount: 1, budget: budget(0) },
          rules(),
          context,
        ),
      ).toThrow(/rate|positive|rational|bound|limit/i);
    },
  );
  it('rejects missing machines and malformed runtime requests', () => {
    expect(() =>
      allocateManual(
        { baseRate: '10', machines: [], budget: budget(0) },
        rules(),
        context,
      ),
    ).toThrow(/machine/i);
    expect(() =>
      underclockAutomatic(
        {
          baseRate: '10',
          machineShards: [],
          targetRate: '1',
          budget: budget(0),
        },
        rules(),
        context,
      ),
    ).toThrow(/machine/i);
    expect(() =>
      maximizeThroughput(
        null as unknown as Parameters<typeof maximizeThroughput>[0],
        rules(),
        context,
      ),
    ).toThrow(/input|request/i);
  });
});
