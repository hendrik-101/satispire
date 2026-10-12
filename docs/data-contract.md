# Production data contract

The shipped `syntheticCatalog` is an original arithmetic example. Its `example:` IDs, names, recipes and rates are not Satisfactory data. It contains ore → ingot → plate/rod, with a kiln, press and shaper invented for deterministic tests. No game assets, copied recipe dataset or verified physical dimensions are included.

## Normalized catalog

`validateCatalog(input: unknown): Catalog` validates an untrusted normalized JSON object and returns a fresh catalog with normalized exact quantities. It throws a diagnostic identifying the invalid field or reference. The schema version is `1`; `catalogVersion` identifies the specific dataset revision independently from the schema.

```json
{
  "schemaVersion": 1,
  "catalogVersion": "synthetic-1",
  "provenance": {
    "kind": "synthetic",
    "source": "Original Satispire arithmetic fixture; not game data"
  },
  "items": [
    { "id": "example:ore", "name": "Example ore", "raw": true },
    { "id": "example:ingot", "name": "Example ingot", "raw": false }
  ],
  "machines": [{ "id": "example:kiln", "name": "Example kiln" }],
  "recipes": [
    {
      "id": "example:smelt",
      "name": "Example smelting",
      "machineId": "example:kiln",
      "durationSeconds": "6",
      "inputs": [{ "itemId": "example:ore", "quantity": "1" }],
      "outputs": [{ "itemId": "example:ingot", "quantity": "1" }]
    }
  ]
}
```

IDs must be globally unique across items, machines and recipes, and consist of letters, digits, colon, underscore, dot, slash or dash, starting with a letter or digit. Every recipe item and machine reference must resolve. Input/output item IDs are unique within each list. Quantities and durations are positive. Recipes may contain multiple outputs for catalog representation, but the solver rejects a reachable selected coproduct recipe explicitly.

Every game dataset, including an unverified local import, requires `provenance.manifest` with these exact fields:

| Field           | Meaning                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| `gameVersion`   | Exact game release label from the source                                                    |
| `build`         | Exact source build identifier                                                               |
| `sourceUrl`     | Traceable source URI or local source identifier                                             |
| `license`       | Explicit rights status; `unresolved-local-only` can describe a private, unresolved import   |
| `contentSha256` | 64 lowercase hexadecimal characters identifying the source content                          |
| `verifiedBy`    | Required for `verified-game`; reviewer or verification evidence identifier                  |
| `verifiedAt`    | Required for `verified-game`; a valid calendar UTC timestamp such as `2026-10-11T00:00:00Z` |

`provenance.kind` is `synthetic`, `unverified-game` or `verified-game`. A scalar optional `gameBuild` must match the manifest's build; scalar optional `verification` is only a descriptive annotation and cannot replace the manifest. Synthetic/example IDs, an explicitly synthetic catalog version or an example/fixture source cannot claim `verified-game` provenance. Validation checks metadata structure and consistency; it does not independently authenticate the dataset, verify its hash against an external file or grant redistribution rights. Unverified imports retain their unverified status.

Users can supply local JSON already normalized to this schema. There is no importer for the game's native `Docs/en-US.json` in this module. Conversion, source review and rights resolution remain separate work. Production data also does not certify layout dimensions: geometry has its own version and provenance contract.

## Exact numbers and bounds

Public quantities and rates are strings: integers (`"30"`), decimals (`"0.125"`) or fractions (`"1/3"`). Output is a reduced fraction with positive denominator or an integer. Negative rational numbers are supported in arithmetic, but production demands, recipe quantities and durations must be positive. Zero denominators, numeric JSON values, exponent notation, whitespace, leading plus, missing decimal digits and negative denominator syntax are rejected.

`Rational.parse` and the immutable `add`, `subtract`, `multiply`, `divide`, `compare`, `ceil` and `toString` methods use bigint internally. Machine counts are bounded safe integer JSON numbers. No bigint or floating arithmetic appears in plan JSON.

External production rates, scale anchors and raw numeric spellings have at most 60 total digits and 123 characters. Normalized arithmetic results have at most 4096 bits in numerator and denominator. `Rational.parseCanonical` accepts only normalized integers or fractions under that arithmetic bound; it rejects decimal spellings, redundant denominators, unreduced fractions and leading zeros. Catalog validation accepts these bounded canonical values as well as raw numeric spellings, so normalizing a valid tiny decimal into a longer fraction remains valid on subsequent validation. This distinction is part of the catalog schema and requires no trust flag in a supplied payload. Public target and anchor parsers retain the stricter 60-digit input bound.

Scaling preserves its computed factor as a `Rational` and applies it to original validated target rows. Computed aggregate demands, utilization and Perfect Ratio components use the 4096-bit arithmetic bound, so a large intermediate fraction can reduce to a valid small final plan. Text/IDs have at most 256 characters. Each catalog collection has at most 2000 entries; each recipe input/output list has at most 64 entries. Targets, recipe choices and import lists each have at most 2000 entries. A stage requires at most 1,000,000 machines. Scaling and Perfect Ratio enforce arithmetic and machine bounds and report conflicts instead of clipping counts.

## Production and scaling

```ts
interface ProductionInput {
  targets: { itemId: string; rate: string }[];
  recipes: Record<string, string>; // output item ID -> explicitly selected recipe ID
  imports: string[]; // explicitly permitted raw item IDs
}
```

`solveProduction(catalog, input): ProductionPlan` solves selected acyclic single-output recipes in items per minute. Manufactured items require explicit choices. Raw items require explicit imports and cannot also have recipe choices. Repeated target rows are aggregated; shared prerequisite demand and direct targets on prerequisites are summed before machine rounding. Inputs, targets, imports and nodes are sorted lexically by item ID, so equivalent catalog/target permutations produce identical JSON.

The returned plan has `schemaVersion: 1`, `catalogVersion`, normalized `targets`, `nodes` and total `imports`. Every node has `itemId`, `recipeId`, `machineId`, `rate`, `craftsPerMinute`, `machineCount`, `utilization` and exact input `rates` in its `inputs` list. Required machines are crafts/minute × durationSeconds / 60. `machineCount` rounds this requirement upward; `utilization` is required machines / rounded count.

`scaleProduction(catalog, input, { itemId, rate }): ProductionPlan` anchors to the item's total rate in an existing manufactured node or raw import and applies desired/current to **all** original targets. The anchor must be present and its desired rate positive. Shared item anchors refer to aggregate demand across the whole plan.

`perfectRatio(catalog, input, { multiples? }): ProductionPlan` chooses the smallest rational factor at least one that makes every machine requirement a whole number and a multiple of its selected building constraint. `multiples` maps active recipe IDs to positive safe integers. For normalized exact requirements divided by those multiples, `a_i/b_i`, the primitive factor is `LCM(b_i)/GCD(a_i)`; the final factor is `ceil(1/primitive) × primitive`. Every target scales by this same factor. A requirement pair of `1.2` and `2.4` machines becomes `2` and `4` with factor `5/3`. The algorithm preserves target proportions and never lowers demand. Raw-only plans remain unchanged. Inactive, invalid or excessive constraints return diagnostics.

This module does not optimize recipe selection, resource ceilings, power, clock speed, amplification, machine-specific game modifiers or fixed stage counts. Unsupported fields are rejected. Cycles include the selected item path in their diagnostic. Effective clock/resource rules must be provided through a separately specified layer; calling whole-chain scaling alone does not establish a globally optimal throughput.
