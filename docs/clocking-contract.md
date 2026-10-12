# Clocking contract

`src/domain/clocking.ts` is a pure, homogeneous production-stage allocator. Every
machine in a request has the same explicitly supplied `baseRate` at clock `1`
(100%). The total throughput is exactly `baseRate * sum(machine clocks)`.
Inputs and outputs use exact rational strings; no floating-point rate arithmetic
or game constants are used.

## Explicit versioned rules

Every call supplies `ClockRules` and `ClockContext`. Rules declare:

- `schemaVersion: 1` and a nonempty `datasetVersion`.
- `provenance: 'synthetic' | 'verified-game' | 'unverified'`.
- Positive `minClock`, `maxClock`, and `baseMaxClock` rational strings, with
  `minClock <= baseMaxClock <= maxClock`.
- Integer `shardSlots` and exactly one shard effect: an explicit nonnegative
  `perShard` increment, or a `maxClockByShard` table indexed by assigned shard
  count, including zero. The table has exactly `shardSlots + 1` entries; its zero
  entry equals `baseMaxClock` and all entries lie within the declared clock range.
  Increment results are capped by `maxClock`.

`context.expectedDatasetVersion` must equal the supplied rules' dataset version.
Unverified rules fail. Synthetic rules require `context.allowSynthetic: true`.
The test fixture is an original arithmetic example, not Satisfactory data.
No game-rule fixture is bundled. A future importer is responsible for verifying
game rules before tagging them `verified-game`; this module checks that tag and
the version, and does not authenticate provenance.

Power Shards are a typed resource: `budget: { resource: 'power-shard', amount }`.
Power Slugs are a different resource and are rejected. Fields mentioning slug
budgets are rejected as well. Conversion belongs in a separately verified rules
source; this module never infers slug-to-shard yields.

## Functions

All functions take `(input, rules, context)` and either return `ClockAllocation`
or throw an explicit diagnostic. They do not mutate their arguments.

- `allocateManual({ baseRate, machines: [{ clock, shards }], budget }, ...)`
  checks each machine's slots, shard-specific maximum and minimum clock, and the
  combined budget. Shards explicitly assigned to an underclocked machine still
  consume its budget.
- `underclockAutomatic({ baseRate, machineShards, targetRate, budget }, ...)`
  preserves machine count, order and assigned shards. It accepts any positive
  target within the exact summed minimum/maximum range. Starting every machine
  at the minimum, it fills additional clock capacity in input order until the
  exact requested rate is reached. This is deterministic throughput allocation;
  it assumes no energy objective or balancing preference.
- `maximizeThroughput({ baseRate, machineCount, budget }, ...)` enumerates the
  finite shard choices using dynamic programming and maximizes the sum of
  allowed clocks for the fixed stage and machine count. Ties use fewer shards,
  then favor assigning shards to earlier machines. Unused budget is retained.
  This establishes only the declared stage's maximum under those constraints;
  it makes no claim about graph-wide production or recipe optimization.

`ClockAllocation` returns normalized `baseRate`, `totalRate`, `totalClock`, each
machine's `clock`, `rate`, and `maxClock`, the shard totals, the dataset version,
and the chosen objective. `energy` is always `{ status: 'unknown' }`. It includes
no inferred power formula, power savings, game modifiers, or Perfect Ratio
semantics.

## Bounds and verification

Calls accept 1–128 machines, 0–512 available shards, and 0–32 shard slots per
machine. Counts must be safe integers. Zero shard budgets and zero shard slots
are valid; zero/negative clocks, base rates and target rates are invalid. Rational
input and arithmetic bounds are enforced by the shared `Rational` implementation.

`tests/clocking.test.ts` verifies manual limits, total spending, exact fractional
underclocking, fixed-machine feasibility, deterministic table optimization,
budget monotonicity, ceiling saturation, Slug rejection, explicit synthetic
opt-in, and stale/unverified rule rejection. All numeric fixture values are
synthetic. Real game behavior remains blocked on verified, versioned rule data.
