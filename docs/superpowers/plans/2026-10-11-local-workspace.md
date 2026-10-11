# Local Workspace Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. One writer; independent final reviewers are read-only.

**Goal:** Usable local production planning with honest game-data import and the approved flexible workspace.
**Architecture:** Browser-only import and pure conversion feed the existing solver. TanStack Start supplies the shell; React state keeps factory intent separate from personal view preferences.
**Tech Stack:** Node 24.19.0, npm 11.9.0, TypeScript, TanStack Start/Router, React, Vite, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-10-11-local-workspace.md

## Global Constraints

No proprietary catalog/assets in Git. No network upload of imported data. Loopback dev server only. No real physical geometry claims. Preserve PR13 and existing VPS ref.

## Review Focus

- Invalid import must preserve last valid state.
- Multiple eligible producers and manufacturing speed must be explicit.
- Cyclic/co-product choices must retain honest solver diagnostics.
- Malformed saved preferences must recover without blocking planning.
- Responsive changes must not mutate personal preferences or selection.

### Task 1: Discovery conversion

Files: scripts/discovery/normalize.cjs and synthetic-test.cjs; src/discovery.ts; tests/discovery.test.ts; scripts/import-discovery.ts.
Interface: convertDiscovery(input: unknown): {catalog: Catalog, details, excluded}; no filesystem dependency in src.

- [x] Write synthetic known-answer and rejection tests; watch missing converter fail.
- [x] Integrate own normalizer; implement bounded schema conversion and standalone local CLI.
- [x] Test conversion, original synthetic checks, full core suite and private real chain.
- [ ] Commit original code/docs/tests only.

### Task 2: Local web workspace

Files: web/router.tsx, web/routes, web/workspace components/style, vite.config.ts, package/tsconfig/eslint changes, tests/browser/workspace.spec.ts.
Interface: Workspace receives validated Catalog and uses solveProduction; imported Catalog never reaches server or storage.

- [x] Write browser tests for real user planning/import/panel/error flows; record initial missing-app failure.
- [x] Add TanStack shell and responsive workspace with forms, stage list, SVG diagram, inspector and local import/export.
- [x] Preserve existing preference functions; pause optional flow motion via visibility/reduced-motion.
- [x] Verify browser cases, core suite, build and loopback app manually.
- [ ] Commit and create Draft follow-up PR with PR13 dependency.

### Task 3: Review and handoff

- [ ] Review immutable follow-up HEAD with independent Codex normal and Security passes.
- [ ] Resolve validated findings with reproducing tests, run required checks.
- [ ] Keep Draft unless all required reviews and CI pass; report external blockers and exact start commands.
