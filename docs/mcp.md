# Shared tools

Classic MCP uses the official TypeScript SDK and stdio. Launch the compiled entrypoint directly; avoid a package-manager wrapper that may write banners to protocol stdout. No session credentials are printed or accepted as tool arguments. The initial local process grants its launching client control of a single private `local` room. A remote Convex capability adapter is not yet connected to this transport.

Every tool takes `roomId`. Room identity is bound when creating the application adapter; adding participantId or role to arguments fails validation. Cross-room calls return `forbidden`. Replies have `{ok,data}` or `{ok:false,error:{code,message}}`; classic MCP also sets `isError`. Solver results are projections, not persisted room changes.

```json
{ "roomId": "local" }
```

`apply_command`:

```json
{
  "roomId": "local",
  "command": {
    "id": "edit-1",
    "expectedRevision": 0,
    "command": { "type": "set-target", "itemId": "example:plate", "rate": "20" }
  }
}
```

An identical retry returns the original revision with `duplicate:true`. A changed payload reusing the ID returns `command-id-reused`; stale edits return `revision-conflict`. Viewer mutations return `forbidden`. Failed planning/commands preserve room state.

`solve_production`:

```json
{
  "roomId": "local",
  "input": {
    "targets": [{ "itemId": "example:plate", "rate": "20" }],
    "recipes": {
      "example:plate": "example:press",
      "example:ingot": "example:smelt"
    },
    "imports": ["example:ore"]
  }
}
```

`generate_floors`:

```json
{
  "roomId": "local",
  "input": {
    "footprint": { "width": 32, "depth": 32 },
    "floorCount": 1,
    "floorHeight": 8,
    "blocks": [{ "id": "block-1", "floor": 0, "count": 8, "rows": 3 }]
  }
}
```

WebMCP is an early-preview browser surface. `registerWebMcp(document, executor)` returns availability and an idempotent disposal function; missing/incomplete APIs leave normal application calls operational. Tool functions delegate arguments to the same application validator. Browser tests emulate `modelContext` and execute real application commands; they are not proof of native support in any AI client. The final product workspace must show and allow leaving presenter-follow mode with Escape and a button.

The initial solver/geometry tools use a pinned original synthetic catalog. A room command records intent; a projection may be infeasible and is explicitly reported by planner functions. Versioned background generation, last-valid rendered layout and online transport require the follow-on workspace integration.

## Vanilla factory projection

The local stdio process uses the same bundled Vanilla 1.2.4.0 / CL 502094 catalog as the UI. `plan_factory` includes per-floor `machineGeometry` metadata for the five machines covered by the licensed 1.2 measurement source, or null otherwise. These building-local metres do not change logical canvas units or floor `physicalPorts`. The preceding `example:` inputs document custom synthetic application instances and are not valid production IDs for this default process. Existing synthetic tools remain available for developer contracts; the CLI `--demo` remains an explicit synthetic test fixture.

Both classic MCP and WebMCP expose `plan_factory` through the same application function. Its input is `{production, rows?}` with `rows:0` for automatic allocation. `production` uses the common targets/recipes/imports schema plus a required technology object `{availableMachines, unlockedRecipes, beltTier, pipeTier}`. It returns `{production,layout}`; the layout is a schematic in logical units with unknown physical footprints and ports. Active machine/recipe locks and transport limits are enforced before projection. Cross-room identity checks happen before argument parsing, and the tool never mutates room intent.

For 20 Iron Plate/min, select `Recipe_IronPlate_C` for `Desc_IronPlate_C` and `Recipe_IngotIron_C` for `Desc_IronIngot_C`; allow `Desc_OreIron_C` imports, both corresponding recipes and the `Desc_ConstructorMk1_C`/`Desc_SmelterMk1_C` machine identities. With beltTier 1 and pipeTier 1, the result needs exactly 30 Iron Ore/min. The compiled MCP smoke exercises this exact call over stdio.

The client workspace registers these tools against the same fixed Vanilla catalog when its host supplies the early-preview `document.modelContext` API. Its private room ID is `local`; command state is client-local, and planning tools return projections from explicit inputs. Tools are deactivated on unmount/pagehide and restored on a persisted pageshow. No host or a failing host leaves normal UI planning available. This is not a provisioned online collaboration service or a claim of native AI-client support. The actual-page browser test supplies a preview host, computes 20 Iron Plates/min from 30 Iron Ore/min and checks cross-room rejection, callback disposal/restoration and reload.

## Build variants in `plan_factory`

`plan_factory.input` accepts `production`, `rows` (0 = auto), and optional `variant`. Both classic MCP and WebMCP delegate to the same strict parser and pure supply projection. The default is:

```json
{
  "schemaVersion": 1,
  "pattern": "alternating",
  "inputSide": "west",
  "outputSide": "east",
  "overrides": []
}
```

Sides are `west`, `east`, `north`, `south`. `fixed` repeats the pair on every floor; `alternating` chooses the configured or swapped pair to minimize summed perimeter distance from actual parent outputs to the stage input, preferring the configured pair on ties. Source stages use the configured pair; sibling branches align. Overrides influence downstream stages, and transfers report remaining side changes. Same-side pairs are supported. Per-stage exceptions use `overrides: [{itemId,inputSide,outputSide}]` and must name unique manufactured stages in the current plan. Limits are 64 floors/overrides and 256 actual dependencies/transfers. Unknown fields/sides/versions fail explicitly. The override count is checked before element parsing; bounded raw JS arrays use indexed JSON-array semantics rather than a caller-defined iterator.

`layout.build` carries the normalized versioned variant and dependency-first floor contract, including each material's source floor (null for external intake). `layout.transfers` contains one named transfer per actual dependency: source/destination floor, common perimeter side/position, stable slot, inclusive span, and perimeter side-change count. Zero side changes means aligned endpoint sides. A stable local perimeter-distance heuristic chooses sides; this does not guarantee globally minimum crossings or physically routed lifts. Input and output positions on `layout.floors[].connections` are block-local. Transfer positions are shared floor coordinates. The old unconditional `floor.lift` placeholder is replaced by `transferIds` referencing actual dependencies. `floor.targetOutput` is null for internal-only stages; otherwise it holds requested delivery rate/line count with a separate `connections.targetOutput` terminal. Aggregate `floor.output` remains total production and transfers retain their individual internal rates. Physical geometry remains null, and synthetic `generate_floors` is unchanged.

UI version-1 plan files now preserve optional `layout: {rows,variant}`. Old version-1 files without layout use automatic rows and the default variant; malformed layout is rejected atomically. Normal UI target changes remove exceptions for stages no longer present; importing a stale named exception fails rather than silently modifying an imported document.

Automatic `rows: 0` uses the largest whole-machine row that fits every input and output at the selected belt/pipe capacity, using exact per-machine rates. An explicit row count remains independent of transport lane count.
