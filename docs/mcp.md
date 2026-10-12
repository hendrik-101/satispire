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
