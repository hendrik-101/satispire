# Fixed Vanilla snapshot

Satisfactory **1.2** is the project target. Every workspace and the default stdio MCP process use `vanilla-1.2.4.0-mcdowell-a3313235-v1`, bound to **1.2.4.0 / CL 502094**. There is no browser game-data import, runtime catalog editor or game installation dependency. Plan JSON contains the catalog version and production intent, including the technology profile. Importing another catalog version, including the previous 1.0 snapshot, fails before replacing the current plan.

Attribution: **Greg McDowell**, [Satisfactory World Analysis & Progression Planner at a3313235d94ac1ab2e0bc4626cdb5ee6dd1f4bef](https://github.com/GMcDowellJr/satisfactory_progression_planner/tree/a3313235d94ac1ab2e0bc4626cdb5ee6dd1f4bef/planning_data/game/reference). Its [MIT notice](ProgressionPlanner-LICENSE.txt) is retained unchanged. `game_builds.csv` identifies 1.2.4.0, CL 502094 and original Docs hash `a81d250e96aa13db3c0bf8c332c199ad930b2f15323e2c1a069afa4c07f971bb`. Only the required identity/numeric fields are normalized; descriptions, game assets and the original Docs export are excluded.

Attribution: **Aadit Sachdev**, [Satisfactory AI at 4ad031efd3631d67676af087035aef8ed32a3b93](https://github.com/AaditS22/satisfactory-ai/tree/4ad031efd3631d67676af087035aef8ed32a3b93/data), supplies names/forms for 17 ammunition/equipment descriptors omitted by the primary `items.csv` table, plus the separate geometry described below. Its complete [MIT notice](SatisfactoryAI-LICENSE.txt) is retained unchanged. No recipe amounts come from this supplemental file. The author identifies Satisfactory 1.2, without an exact build stamp.

The [source manifest](vanilla-source-manifest.json) pins both authors' URLs and source hashes. Catalog `manifest.contentSha256` is the SHA256 of the compact, key-sorted JSON `referenceFiles` hash map. The supplemental item and geometry file hashes are separately pinned in the same source manifest. `provenance.kind` remains `unverified-game`: the source's build evidence is recorded, but this executor did not authenticate it against a running game install.

The snapshot contains 179 item records, 11 production machines and 276 non-seasonal manufacturing recipes. The source has 291 manufacturing recipes; 15 recipes unlocked only through FICSMAS schematics are excluded explicitly to retain the existing non-seasonal workflow. Raw inputs are the 13 resource descriptors and seven unproduced biomass descriptors, not arbitrary missing recipes or generator waste. Converter recipes are present. Multi-output recipes are retained as catalog facts, but the exact DAG solver rejects coproducts and cycles. The UI offers solvable targets under the applied profile. Explicit unsupported choices fail without replacing the previous plan.

HUB unlock tiers are regenerated from the 1.2 tutorial/milestone schematics and the explicit `Schematic_StartingRecipes_C` starting set. No 1.0 unlock table or old starting-recipe correction is reused. MAM/alternate recipes remain explicit profile choices. Machine and belt/pipe tier unlocks derive from the matching 1.2 building recipes. The individual lists permit custom profiles; they do not infer a save's actual progress.

Belts have capacities 60/120/270/480/780/1200 items/min; pipes 300/600 m³/min. The shared solver enforces available machines and selected recipe unlocks for every reachable stage. It increases machine count and reduces utilization when a single per-item machine connection cannot accept the full-clock flow on the selected tier. All quantities remain rational. `Perfect Ratio` rejects a full-clock/transport conflict instead of promising full utilization. The layout sizes aggregate supply line counts with these same capacities.

These capacities and their unlock tiers were compared with the publisher's current 1.2 reference and are unchanged. Calls use default 1× recipe costs. The 1.2 recipe-cost setting, resource randomization, power/clock modifiers, extraction/node-purity models and general optimization are not modeled; unsupported modifier fields are rejected instead of ignored. Clocking's separate explicit-rule API has no bundled game-rule or power model.

To regenerate, fetch the nine CSV files and the two Satisfactory AI JSON files at the exact source-manifest revisions, retain their license notices, then run:

```sh
python scripts/import-vanilla-reference.py REFERENCE_DIRECTORY SATISFACTORY_AI_DATA_DIRECTORY/catalog.json
npx prettier --write src/data/vanilla-snapshot.ts src/data/machine-geometry.ts
```

The importer verifies every source file hash and build stamp before writing either snapshot. It reads CSV/JSON without executing source content. The previous SatisfactoryTools 1.0 data is retired; its retained license and historical QA documents are not active version declarations.

# Geometry evidence

See the [geometry source and license assessment](geometry-sources.md). Licensed 1.2 upstream measurements are bundled for Smelter, Constructor, Assembler, Manufacturer and Foundry, with visible bounds, hard clearance and building-local conveyor ports kept separate. They are exposed as floor `machineGeometry` metadata and dimensions appear in the inspector. Unknown machines return null. The source does not establish an exact CL 502094 geometry match.

Floor `physicalFootprint` and `physicalPorts` remain null because the canvas still uses logical coordinates; the upstream local ports are not routed canvas connections. All schematic floors share an origin and area. Physical packing, soft-clearance collision rules, individual conveyors and height-fit remain separate work. Source attribution and complete MIT texts are available under the inspector's “Quellen und Lizenzen” and included in the web bundle and runtime image.
