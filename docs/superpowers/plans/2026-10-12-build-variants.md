# Build variants implementation plan

> Execute inline using superpowers:executing-plans. One writer; external final reviews.

Goal: usable deterministic build variants shared by UI and both MCP adapters.
Architecture: a pure versioned variant projection drives the existing supply layout; all consumers receive the same result.
Tech: existing Node 24, TypeScript, React, Zod, Vitest, Playwright; no new dependencies.
Spec: ../specs/2026-10-12-build-variants.md

## Constraints and review focus

Preserve PR13/14 ancestry and art. No physical geometry claims or deployment. Check dependency ordering, bypasses, dormant overrides after target changes, invalid import atomicity and mobile fit with all sides.

### Task 1: Shared projection and adapters

Files: src/domain/build-variants.ts, supply-layout.ts, application.ts, tests/build-variants.test.ts, tests/mcp.test.ts.
Interface: variantSchema/defaultBuildVariant; deriveBuildVariants(plan, raw) returns normalized variant, dependency-first floor sides, input origins, transfers and topology diagnostics. generateSupplyLayout accepts optional fifth variant argument. plan_factory accepts optional variant alongside rows.

- [x] Write known-answer domain tests; run and record RED.
- [x] Implement bounded deterministic projection and integrate supply layout and plan_factory.
- [x] Exercise actual MCP/WebMCP parity and rejection; run unit suite.

### Task 2: UI and files

Files: web/workspace/FloorView.tsx, VariantControl.tsx, Workspace.tsx, workspace.css; shared plan-file schema; tests/browser/build-variants.spec.ts.

- [x] Write failing browser tests for presets, overrides, export/import and mobile fitting.
- [x] Add compact contextual control and side-aware upright schematic renderer.
- [x] Preserve rows and variants in exports; validate optional layout before atomic import.
- [x] Run browser regressions; capture desktop, multiple inputs, same-side and mobile screenshots.

### Task 3: Review gates

- [ ] Run check, coverage, audit, browser and diff validation.
- [ ] Commit and push isolated branch; create Draft PR based on feat/local-workspace-ui.
- [ ] Request actual normal Codex/Security review, repair validated findings and rerun gates/reviews.
- [ ] Promote only on current-head green CI and completed clean reviews; otherwise document blocker.

Execution ruling: user explicitly authorized implementation/Cloud continuation and supplied design constraints; existing design contract favors execution over a renewed approval loop. Repository has no .agents or AGENTS.md. npm cache is /tmp because the home cache is not writable.
