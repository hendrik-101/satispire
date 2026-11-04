# Coproduct Production Implementation Plan

> **For agentic workers:** Use the coordinated implementation workflow; the user requested immediate implementation.

**Goal:** Make rubber, plastic and oil products selectable, calculable and usable in saved factory plans.

**Architecture:** Keep exact rational arithmetic and explicit recipe selections. Balance all outputs of each reachable selected recipe once, reuse coproducts and expose excess. Preserve single-output results and adapt transport, graph and production views to distinguish stages from output materials.

**Tech Stack:** Existing TypeScript, React, Vitest and Playwright; no external solver dependency.

**Spec:** User request in this chat: implement the missing support for multiple outputs, their further processing and surplus.

## Global constraints

- Existing catalog provenance, technology and raw import rules remain authoritative.
- One executed recipe means one machine group and one set of input consumption.
- Exact rates remain rational strings; all output capacities must be checked.
- Preserve existing single-output JSON, persistence authorization and last-valid-plan behavior.
- Draft pull request only; merging and deployment require separate authorization.

## Review focus

- Unequal demands for two outputs must not duplicate the machines.
- A coproduct used downstream reduces additional production and leaves an exact surplus.
- Multiple producers of one material must route without losing or duplicating flow.
- Scaling and Perfect Ratio must include coproducts and preserve balances.
- Tier-five oil plans must pass shared-session validation and file export.

### Task 1: Exact production balances

Files: production.ts, new bounded rational balance solver, production tests.

- [x] Write and run failing known-answer tests for coproduct demands, reuse, surplus, order invariance and scaling.
- [x] Add optional full node outputs and plan surplus, retaining the legacy single-output representation.
- [x] Solve reachable selected recipes deterministically, deduplicating recipes and enforcing existing bounds and technology.
- [x] Run domain tests and inspect exact material conservation.

### Task 2: Output-aware transport and layout

Files: production-flows.ts, build-variants.ts, belt-routing.ts, supply-layout.ts and associated renderers/tests.

- [x] Test shared-output allocation and surplus transport with known exact rates.
- [x] Allocate produced materials to consumers, targets and surplus deterministically.
- [x] Route all outputs from the same machines with distinct material ports and capacities.
- [x] Verify persistence validation accepts supported oil plans.

### Task 3: Recipe discovery and presentation

Files: vanilla.ts, workspace model, Workspace, ProductionView, Graph and tests.

- [x] Write failing discovery tests for tier-five rubber, plastic, fuel and coproducts.
- [x] Discover recipes by any produced output while keeping selections acyclic and explicit.
- [x] Display all actual outputs and excess; connect graphs to producing stages.
- [x] Verify oil targets, per-machine amounts, save/export and existing browser regressions.

### Task 4: Integration and delivery

- [x] Update production and architecture contracts to describe the final supported behavior and limits.
- [x] Run npm run check and npm run test:coverage plus relevant browser tests.
- [x] Review current changes for correctness and security; fix valid findings.
- [x] Commit, push and create a Draft PR with validation evidence; report any unavailable remote reviews.

Delivery: [Draft PR #32](https://github.com/hendrik-101/satispire/pull/32). Service-side current-head reviews and CI are still required before promotion.
