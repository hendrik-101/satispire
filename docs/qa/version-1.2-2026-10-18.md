# Satisfactory 1.2 migration and version audit

The user set Satisfactory 1.2 as the project target and required a check for assumptions inherited from the previous 1.0 snapshot. This supersedes earlier planning documents' active game-version declarations; their dated screenshots and QA results remain historical evidence.

## Data and provenance

The active catalog is regenerated from Greg McDowell's MIT-licensed, build-stamped reference tables at revision `a3313235d94ac1ab2e0bc4626cdb5ee6dd1f4bef`. `game_builds.csv` identifies Satisfactory **1.2.4.0 / CL 502094**, original Docs hash `a81d250e96aa13db3c0bf8c332c199ad930b2f15323e2c1a069afa4c07f971bb`. The new catalog ID is `vanilla-1.2.4.0-mcdowell-a3313235-v1`. Hashes for the nine input CSVs are pinned in [the source manifest](../data/vanilla-source-manifest.json); the original game dump and assets are not committed.

The reference's `items.csv` omits 17 ammunition/equipment descriptors named by recipe IO. Their names and solid forms are supplied by Aadit Sachdev's separately pinned MIT-licensed 1.2 data, without importing its recipe rates. Both authors and their complete notices are retained in the browser bundle, inspector and runtime-image licenses.

The unlicensed Deetss dataset and its implementation were removed. Its previous approval is not treated as source permission. An MIT-labelled alternative explicitly derived from SCIM was also rejected because SCIM prohibits reuse. See [the source assessment](../data/geometry-sources.md).

## Audit results

| Area                | Finding and resulting behavior                                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipes             | All 276 previously supported manufacturing recipes exist in the 1.2 reference. Input/output quantities, cycle durations and producer identities agree. They were regenerated from the new source rather than relabelled.                        |
| Scope               | The 1.2 source has 291 manufacturing recipes; 15 FICSMAS-only recipes remain explicitly excluded from this non-seasonal workflow. Converter recipe facts are present.                                                                           |
| Item identities     | 179 items, including the 17 resolved ammo/equipment descriptors. Raw inputs remain 13 resource descriptors and seven unproduced biomass descriptors; waste/byproducts are not silently made raw.                                                |
| Unlocks             | Recipe and machine tiers are rebuilt from 1.2 schematics and building recipes. HUB/tutorial/starting recipes are distinguished from MAM and alternates. No old 1.0 starting-recipe patch is reused.                                             |
| Transport           | Belt capacities 60/120/270/480/780/1200 and pipe capacities 300/600 agree with the current reference. HUB defaults now derive transport tiers from source unlocks instead of duplicated threshold code.                                         |
| Version binding     | UI and default stdio MCP share the new catalog. Exports identify that exact catalog. Old 1.0 imports fail atomically and report the current version. Generic custom-catalog schemas remain generic.                                             |
| Geometry            | Five independently sourced MIT-licensed 1.2 machine measurements include separate rendered bounds, hard clearance and local conveyor ports. Upstream exact build is unknown and remains null. The other six machines remain unknown.            |
| Height              | A machine's rendered height can exceed its hard-clearance height. The inspector now shows both; neither is substituted for the other or treated as a completed height-fit rule.                                                                 |
| Recipe-cost setting | Default 1× recipe costs only. A nondefault `recipeCostMultiplier` is rejected by the shared solver instead of being ignored. No unverified liquid-rounding rule is invented.                                                                    |
| Clocking and power  | The separate clock allocator uses supplied, version-checked rules and synthetic tests. It does not bundle a 1.0 rule set, infer a real-game power exponent or report fabricated energy figures. Graph production remains nominal-rate planning. |
| World/save variants | Resource randomization, node purity, world modifiers and amplification remain explicit unsupported scope. The app does not silently substitute a default-world model.                                                                           |
| Synthetic paths     | CLI demo and synthetic geometry are original arithmetic fixtures, not old Satisfactory data. Software/schema versions, 1.2× zoom factors and SVG coordinates are not game-version declarations.                                                 |

The old metadata classified `Recipe_Alternate_Turbofuel_C` as a hard-drive alternate. The 1.2 reference classifies it as non-alternate and records its Sulfur MAM unlock (despite the recipe's class name). Regeneration corrects that inherited classification; a regression ensures it still requires an explicit unlock rather than appearing automatically at a HUB tier.

Display names also come from the current reference. A full browser run exposed an old exact-name expectation for `Alternate: Cast Screw`; the imported 1.2 name is `Alternate: Cast Screws`. The test now uses that current name while retaining its exact resource-demand checks.

Physical floor packing, soft-clearance collision rules, individual belt routes, height-fit, coproduct/cyclic solving and online collaboration remain separate capabilities. Updating the data version does not claim those capabilities are complete.

## Reproduction and verification

Regenerate using the exact files listed in the source manifest:

```sh
python scripts/import-vanilla-reference.py REFERENCE_DIRECTORY SATISFACTORY_AI_DATA_DIRECTORY/catalog.json
npx prettier --write src/data/vanilla-snapshot.ts src/data/machine-geometry.ts
npm run check
npm run test:coverage
APP_REVISION=<current-git-revision> npm run build:runtime
npm run test:runtime
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser:runtime
APP_REVISION=<current-git-revision> npm run test:container
```

Focused regressions cover the 1.2.4.0 build binding, Turbofuel's explicit MAM unlock, explicit recipe-modifier rejection, geometry/clearance separation, unsupported geometry/version rejection, selected-stage measurements, complete MIT credits, and refusal of a 1.0 import while preserving a valid 1.2 plan. Runtime/container verification also checks delivery of both complete license notices.

Checks on 18 October 2026 passed discovery, formatting, lint, type checking, compiled CLI/MCP smoke and production builds. All **344 tests across 24 files** pass, with **95.75% line coverage**. The production HTTP smoke and disposable Docker smoke pass, including actual SSR/assets, health/revision checks, runtime restrictions and shutdown; the container contains both complete MIT notices.

The final full browser run against the production listener passes **46/46 cases**, including the corrected Cast Screws name, current-version plan round trips, atomic refusal of old plans and visible source notices.

Independent source checks compared all 276 recipe quantities, durations and producers, raw-input classifications, and machine tiers with the previous snapshot. The one alternate-classification difference is documented above. Both checked-in notices match their pinned upstream files verbatim. Regeneration into a temporary directory reproduces both snapshots byte-for-byte after formatting. A deliberately altered CSV fails its source hash check without writing either snapshot. The data and measurements have not been independently verified against a locally running game installation.
