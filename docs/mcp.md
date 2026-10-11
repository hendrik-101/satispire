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

The local stdio process now uses the same bundled Vanilla 1.0 catalog as the UI. The preceding `example:` inputs document custom synthetic application instances and are not valid production IDs for this default process. Existing synthetic tools remain available for developer contracts; the CLI `--demo` remains an explicit synthetic test fixture.

Both classic MCP and WebMCP expose `plan_factory` through the same application function. Its input is `{production, rows?}` with `rows:0` for automatic allocation. `production` uses the common targets/recipes/imports schema plus a required technology object `{availableMachines, unlockedRecipes, beltTier, pipeTier}`. It returns `{production,layout}`; the layout is a schematic in logical units with unknown physical footprints and ports. Active machine/recipe locks and transport limits are enforced before projection. Cross-room identity checks happen before argument parsing, and the tool never mutates room intent.

For 20 Iron Plate/min, select `Recipe_IronPlate_C` for `Desc_IronPlate_C` and `Recipe_IngotIron_C` for `Desc_IronIngot_C`; allow `Desc_OreIron_C` imports, both corresponding recipes and the `Desc_ConstructorMk1_C`/`Desc_SmelterMk1_C` machine identities. With beltTier 1 and pipeTier 1, the result needs exactly 30 Iron Ore/min. The compiled MCP smoke exercises this exact call over stdio.
