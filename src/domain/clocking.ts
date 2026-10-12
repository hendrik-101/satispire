import { Rational } from './rational.js';

export interface ClockRules {
  schemaVersion: 1;
  datasetVersion: string;
  provenance: 'synthetic' | 'verified-game' | 'unverified';
  minClock: string;
  maxClock: string;
  baseMaxClock: string;
  shardSlots: number;
  shardEffect:
    | { kind: 'increment'; perShard: string }
    | { kind: 'table'; maxClockByShard: string[] };
}

export interface ClockContext {
  expectedDatasetVersion: string;
  allowSynthetic?: boolean;
}

export interface ShardBudget {
  resource: 'power-shard';
  amount: number;
}

export interface MachineClock {
  clock: string;
  shards: number;
}

export interface ManualClockInput {
  baseRate: string;
  machines: MachineClock[];
  budget: ShardBudget;
}

export interface UnderclockInput {
  baseRate: string;
  machineShards: number[];
  targetRate: string;
  budget: ShardBudget;
}

export interface MaximizeInput {
  baseRate: string;
  machineCount: number;
  budget: ShardBudget;
}

export interface ClockAllocation {
  schemaVersion: 1;
  datasetVersion: string;
  objective: 'manual' | 'requested-throughput' | 'max-throughput';
  baseRate: string;
  totalRate: string;
  totalClock: string;
  shardsUsed: number;
  shardsRemaining: number;
  machines: (MachineClock & { rate: string; maxClock: string })[];
  energy: { status: 'unknown' };
}

const ZERO = Rational.parse('0');
const LIMITS = { machines: 128, shards: 512, slots: 32 } as const;

interface ValidatedRules {
  datasetVersion: string;
  minimum: Rational;
  maxima: Rational[];
}

function assertObject(
  value: unknown,
  name: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function integer(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer within limits ${minimum}..${maximum}`,
    );
  }
}

function positive(value: string, name: string): Rational {
  const parsed = Rational.parse(value);
  if (parsed.compare(ZERO) <= 0) throw new Error(`${name} must be positive`);
  return parsed;
}

function validateRules(
  rules: ClockRules,
  context: ClockContext,
): ValidatedRules {
  assertObject(rules, 'Clock rules');
  assertObject(context, 'Clock context');
  if (rules.schemaVersion !== 1)
    throw new Error('Unsupported clock rules schema version');
  if (
    typeof rules.datasetVersion !== 'string' ||
    !rules.datasetVersion.trim() ||
    rules.datasetVersion.length > 200
  ) {
    throw new Error(
      'Clock rules dataset version is required within length limits',
    );
  }
  if (context.expectedDatasetVersion !== rules.datasetVersion)
    throw new Error('Stale clock rules dataset version');
  if (rules.provenance === 'unverified')
    throw new Error('Unverified clock rules are unsupported');
  if (rules.provenance === 'synthetic') {
    if (context.allowSynthetic !== true)
      throw new Error('Synthetic clock rules require explicit opt-in');
  } else if (rules.provenance !== 'verified-game') {
    throw new Error('Unknown clock rules provenance');
  }
  const minimum = positive(rules.minClock, 'Minimum clock rule');
  const maximum = positive(rules.maxClock, 'Maximum clock rule');
  const baseMaximum = positive(rules.baseMaxClock, 'Base maximum clock rule');
  if (minimum.compare(baseMaximum) > 0 || baseMaximum.compare(maximum) > 0) {
    throw new Error(
      'Clock rules require minimum <= base maximum <= global maximum',
    );
  }
  integer(rules.shardSlots, 0, LIMITS.slots, 'Shard slot rule');
  assertObject(rules.shardEffect, 'Shard effect rule');
  let maxima: Rational[];
  if (rules.shardEffect.kind === 'increment') {
    const increment = Rational.parse(rules.shardEffect.perShard);
    if (increment.compare(ZERO) < 0)
      throw new Error('Shard increment rule must be nonnegative');
    maxima = Array.from({ length: rules.shardSlots + 1 }, (_, shards) => {
      const candidate = baseMaximum.add(
        increment.multiply(Rational.parse(String(shards))),
      );
      return candidate.compare(maximum) > 0 ? maximum : candidate;
    });
  } else if (rules.shardEffect.kind === 'table') {
    const table = rules.shardEffect.maxClockByShard;
    if (!Array.isArray(table) || table.length !== rules.shardSlots + 1) {
      throw new Error(
        'Shard maximum table must have exactly one entry per shard count including zero',
      );
    }
    maxima = table.map((clock) =>
      positive(clock, 'Shard table maximum clock rule'),
    );
    if (maxima[0]!.compare(baseMaximum) !== 0)
      throw new Error('Shard table zero entry must equal base maximum clock');
    for (const clock of maxima) {
      if (clock.compare(minimum) < 0 || clock.compare(maximum) > 0) {
        throw new Error(
          'Shard table clock must lie within minimum and global maximum rules',
        );
      }
    }
  } else {
    throw new Error('Unsupported shard effect rule');
  }
  return { datasetVersion: rules.datasetVersion, minimum, maxima };
}

function validateRequest(
  input: ManualClockInput | UnderclockInput | MaximizeInput,
): { baseRate: Rational; budget: number } {
  assertObject(input, 'Clocking input');
  if (Object.keys(input).some((key) => /slug/i.test(key)))
    throw new Error(
      'Slug budgets require an explicit external conversion; only Power Shards are accepted',
    );
  assertObject(input.budget, 'Power Shard budget');
  if (
    input.budget.resource !== 'power-shard' ||
    Object.keys(input.budget).some((key) => /slug/i.test(key))
  ) {
    throw new Error(
      'Budget resource must be power-shard; slugs are not shards',
    );
  }
  integer(input.budget.amount, 0, LIMITS.shards, 'Power Shard budget');
  return {
    baseRate: positive(input.baseRate, 'Base rate'),
    budget: input.budget.amount,
  };
}

function validateShards(
  shards: number[],
  rules: ValidatedRules,
  budget: number,
): void {
  if (!Array.isArray(shards))
    throw new Error('Machine shard assignments must be an array');
  integer(shards.length, 1, LIMITS.machines, 'Machine count');
  let used = 0;
  for (const count of shards) {
    integer(count, 0, rules.maxima.length - 1, 'Per-machine shard count');
    used += count;
  }
  if (used > budget)
    throw new Error('Assigned shards exceed available Power Shard budget');
}

function allocation(
  objective: ClockAllocation['objective'],
  baseRate: Rational,
  budget: number,
  rules: ValidatedRules,
  machines: { clock: Rational; shards: number }[],
): ClockAllocation {
  let totalClock = ZERO;
  let used = 0;
  const result = machines.map(({ clock, shards }) => {
    const parsed = clock;
    const maximum = rules.maxima[shards]!;
    if (parsed.compare(rules.minimum) < 0)
      throw new Error('Machine clock is below minimum');
    if (parsed.compare(maximum) > 0)
      throw new Error('Machine clock is above assigned-shard maximum');
    totalClock = totalClock.add(parsed);
    used += shards;
    return {
      clock: parsed.toString(),
      shards,
      rate: baseRate.multiply(parsed).toString(),
      maxClock: maximum.toString(),
    };
  });
  return {
    schemaVersion: 1,
    datasetVersion: rules.datasetVersion,
    objective,
    baseRate: baseRate.toString(),
    totalRate: baseRate.multiply(totalClock).toString(),
    totalClock: totalClock.toString(),
    shardsUsed: used,
    shardsRemaining: budget - used,
    machines: result,
    energy: { status: 'unknown' },
  };
}

export function allocateManual(
  input: ManualClockInput,
  rules: ClockRules,
  context: ClockContext,
): ClockAllocation {
  const validated = validateRules(rules, context);
  const request = validateRequest(input);
  if (!Array.isArray(input.machines))
    throw new Error('Machines must be an array');
  integer(input.machines.length, 1, LIMITS.machines, 'Machine count');
  for (const machine of input.machines)
    assertObject(machine, 'Machine assignment');
  validateShards(
    input.machines.map((machine) => machine.shards),
    validated,
    request.budget,
  );
  return allocation(
    'manual',
    request.baseRate,
    request.budget,
    validated,
    input.machines.map(({ clock, shards }) => ({
      clock: Rational.parse(clock),
      shards,
    })),
  );
}

export function underclockAutomatic(
  input: UnderclockInput,
  rules: ClockRules,
  context: ClockContext,
): ClockAllocation {
  const validated = validateRules(rules, context);
  const request = validateRequest(input);
  validateShards(input.machineShards, validated, request.budget);
  const targetClock = positive(input.targetRate, 'Target rate').divide(
    request.baseRate,
  );
  const minimumTotal = validated.minimum.multiply(
    Rational.parse(String(input.machineShards.length)),
  );
  const maximumTotal = input.machineShards.reduce(
    (sum, shards) => sum.add(validated.maxima[shards]!),
    ZERO,
  );
  if (
    targetClock.compare(minimumTotal) < 0 ||
    targetClock.compare(maximumTotal) > 0
  ) {
    throw new Error(
      'Target rate is outside the attainable range for these machines and shard assignments',
    );
  }
  let remaining = targetClock.subtract(minimumTotal);
  const machines = input.machineShards.map((shards) => {
    const capacity = validated.maxima[shards]!.subtract(validated.minimum);
    const extra = remaining.compare(capacity) < 0 ? remaining : capacity;
    remaining = remaining.subtract(extra);
    return { shards, clock: validated.minimum.add(extra) };
  });
  return allocation(
    'requested-throughput',
    request.baseRate,
    request.budget,
    validated,
    machines,
  );
}

interface State {
  clock: Rational;
  shards: number;
  tail: State | undefined;
}

export function maximizeThroughput(
  input: MaximizeInput,
  rules: ClockRules,
  context: ClockContext,
): ClockAllocation {
  const validated = validateRules(rules, context);
  const request = validateRequest(input);
  integer(input.machineCount, 1, LIMITS.machines, 'Machine count');
  const slots = validated.maxima.length - 1;
  const budget = Math.min(request.budget, input.machineCount * slots);
  let previous: (State | undefined)[] = [
    { clock: ZERO, shards: 0, tail: undefined },
  ];
  for (let machines = 1; machines <= input.machineCount; machines++) {
    const current: (State | undefined)[] = [];
    for (let spent = 0; spent <= Math.min(budget, machines * slots); spent++) {
      let best: State | undefined;
      // Descending shard choices favor earlier machines when throughput ties.
      for (let shards = Math.min(slots, spent); shards >= 0; shards--) {
        const tail = previous[spent - shards];
        if (!tail) continue;
        const clock = validated.maxima[shards]!.add(tail.clock);
        if (!best || clock.compare(best.clock) > 0)
          best = { clock, shards, tail };
      }
      current[spent] = best;
    }
    previous = current;
  }
  // Ascending spend favors fewer shards when throughput ties.
  let best: State | undefined;
  for (const candidate of previous) {
    if (candidate && (!best || candidate.clock.compare(best.clock) > 0))
      best = candidate;
  }
  const machines: { clock: Rational; shards: number }[] = [];
  let state = best;
  for (let index = 0; index < input.machineCount; index++) {
    if (!state) throw new Error('No feasible clock allocation');
    machines.push({
      shards: state.shards,
      clock: validated.maxima[state.shards]!,
    });
    state = state.tail;
  }
  return allocation(
    'max-throughput',
    request.baseRate,
    request.budget,
    validated,
    machines,
  );
}
