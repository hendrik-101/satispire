# Satispire

Parametric production and multistory factory planning for Satisfactory. Independent fan project, not affiliated with Coffee Stain.

This first executable slice provides an exact production solver, synthetic machineblock/floor generation, a JSON CLI, shared authorized commands, classic MCP and feature-detected WebMCP adapters. The user approved a floor-centered workspace with optional graph and panels. The TanStack Start workspace targets **Satisfactory 1.2**, using a pinned **1.2.4.0 / CL 502094** production snapshot, optional panels and a schematic block canvas. See [local workspace](docs/local-workspace.md) and [catalog provenance and limits](docs/data/vanilla.md). Convex transaction functions and the online session UI are implemented; an online deployment must be configured explicitly. Without one, complete local sessions persist in browser storage across reloads.

## Run

Use Node **24.19.0** and npm **11.9.0**:

```sh
npm ci
npm run plan -- --demo
npm run plan -- --input fixtures/plan.synthetic.json
npm run check
npm run test:coverage
npx playwright install --with-deps chromium
npm run test:browser
```

If a compatible Chromium is already installed, use `PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`. Browser tests verify the local workspace and adapter calls/fallback in a preview-API harness; they do not establish native AI-client WebMCP support.

The demo turns 20 example plates/min and 15 example rods/min into three stages, exact imports and automatically arranged stories sharing a 32×32 logical footprint. Results include machines, uneven rows, manifold topology, aggregate ports and lift reservations. These are original synthetic fixtures, **not Satisfactory recipes or physical measurements**. No individual conveyor segments are planned.

## Production and clocking

Rates are exact strings such as `20`, `0.1` or `1/3`. Explicit selected recipes form an acyclic single-output graph; shared dependencies and multiple targets balance exactly. Unsupported cycles, coproducts, extraction models, world modifiers and amplification fail explicitly. Machine count is the upward rounded exact requirement; utilization is separate.

`scaleProduction` scales all targets at a chosen item stage; it is not global throughput optimization. `perfectRatio` computes the smallest rational scale factor at least 1 that satisfies whole-machine and selected building-multiple constraints, rather than unnecessarily forcing an integer factor. Clock allocation supports manual Power Shard budgets, automatic underclocking and a separate fixed-stage throughput objective under explicit versioned rules. Energy is unknown until a verified model is supplied. Slugs are not treated as Shards.

## Local data

```sh
npm run plan -- --input my-plan.json --catalog my-normalized-catalog.json
```

The versioned normalized contract and limitations are in [data-contract](docs/data-contract.md), [geometry-contract](docs/geometry-contract.md) and [clocking-contract](docs/clocking-contract.md). This slice accepts normalized user imports, not raw game Docs JSON. The own discovery normalizer and bounded local converter are integrated; see [local workspace](docs/local-workspace.md). Do not commit raw game data, icons, meshes or a full catalog with unresolved redistribution rights. The UI uses licensed 1.2 numeric sources, with explicit attribution and MIT notices. Five machines have separate source-local bounds/clearance/port metadata; canvas placement remains logical and is not marked physically layout-ready. See the [1.2 audit](docs/qa/version-1.2-2026-10-18.md).

## MCP and collaboration

Opening the workspace creates or restores an unlisted session URL. The complete last calculated plan, recipe choices, targets, unlocks, rows and build variants survive F5. Without `VITE_CONVEX_URL` this is explicitly a local browser session; its link cannot transfer data to another device.

Online sessions support a Sites Worker with its managed D1 database, or a dedicated Convex backend configured through the public `VITE_CONVEX_URL` during build/startup. The browser discovers the Site transport through `/api/session-config`; ordinary static and HTTP builds retain explicit local persistence. Anyone with an online session link can join and edit; private participant credentials are stored separately in that browser. Plans update through reactive subscriptions with revision conflict checks. Live cursors use diagram coordinates and appear only on the same view/floor, expiring after disconnect. See [session setup and behavior](docs/local-workspace.md#durable-sessions-and-online-collaboration).

Build with `npm run build`. Configure a compatible classic MCP client to launch `node /absolute/checkout/dist/adapters/stdio.js` with room ID `local`. The stdio process has a private local owner session; it opens no network listener and does not connect to online rooms. State lasts for the process lifetime. Call `read_room`, `apply_command`, `solve_production` and `generate_floors`. See [MCP contract](docs/mcp.md) for input examples and errors.

WebMCP detects `document.modelContext`; the normal application calls remain available when it is missing. Native Claude WebMCP support is not established. Both adapters call the same authorization and planner functions.

The older room API implements anonymous capabilities, single-use role invitations and transactional revision/idempotency checks. The first-feature session API adds reusable share links and complete plan persistence. [Collaboration contract](docs/collaboration-contract.md) distinguishes both interfaces and their deployment requirements. Cursor visibility is scoped to view/floor; presenter following in the older room API is voluntary and reversible and is not exposed in the first-feature session UI. There is no forced fullscreen or eight-person hard cap.

[Architecture and scope](docs/architecture.md) describe the staged implementation. [Personal view preferences](docs/view-preferences.md) define presets, responsive panel presentation and temporary camera following separately from shared factory data. [Contributing](CONTRIBUTING.md) describes the Draft review policy. This slice is not a claim that issues #1–#12 or the full web MVP are complete. Merge and deployment are separate coordinated decisions.

The [HTTP/container test runtime and deployment guide](docs/deployment.md) provides production start, immutable revision/health checks, an isolated test Compose contract and verified squash integration recipe. Live rollout remains a separate decision.
