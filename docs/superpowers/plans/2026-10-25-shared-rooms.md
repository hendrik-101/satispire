# Shared Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Share persistent rooms with live plans, reversible history and an output-labelled recent-room entry dialog.

**Architecture:** Extend the existing Convex room backend with complete plan state,
reusable editor links, indexed history and transactional compensating edits.
Connect the workspace through a room client while keeping browser preferences
separate. Preserve existing local CLI/MCP behavior.

**Tech Stack:** TypeScript, React, TanStack Start/Router, Convex, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-shared-rooms.md`

## Global Constraints

- Use Node 24.19.0 and npm 11.9.0; retain existing pinned dependencies.
- Preserve the existing design contract and domain/adapter separation.
- Share the room, including full plan intent and unlocks; view preferences stay local.
- Keep history immutable; undo appends a compensating edit.
- Browser address and Share use `/room/<roomId>#key=<shareSecret>`.
- No merge, deployment, credentials or infrastructure changes.
- Deliver a committed, pushed Draft PR; live backend availability must be reported separately.

## Review Focus

- Corrupt or disabled browser storage must not prevent explicit room opening.
- Reusing a share link in another browser must not disclose owner authority.
- Undo after another participant's dependent edit must fail without partial writes.
- Navigation or a late network response must not apply a previous room's plan.
- An unset Convex deployment must show an actionable error, never simulated saving.

---

### Task 1: Complete shared plan and selective undo

**Files:** Create `src/domain/shared-plan.ts`, `tests/shared-plan.test.ts`.

**Interfaces:** Export `SharedPlan` derived from the plan-file contract,
`validateSharedPlan(input: unknown): SharedPlan`,
`diffPlan(before: SharedPlan, after: SharedPlan): PlanChange[]` and
`reversePlan(current: SharedPlan, changes: PlanChange[]): SharedPlan`.
`PlanChange` identifies atomic plan fields with before/after presence and values;
use the same field partition for diffing and reverse checks.

- [x] Write known-answer tests for full plan preservation, unrelated later edits,
      overlapping-field conflict, atomic targets/imports/recipes, unlock/technology
      mismatch and invalid resulting production. Run `npx vitest run tests/shared-plan.test.ts`
      and confirm the new behavior initially fails.
- [x] Implement catalog-aware full plan validation and reversal without clocks,
      persistence or network dependencies; preserve existing planner contracts.
- [x] Rerun the focused tests and typecheck; commit this deliverable.

### Task 2: Persistent room plans, joins and history

**Files:** Modify `convex/schema.ts`, `convex/rooms.ts`; create
`convex/plans.ts`, `tests/shared-rooms.test.ts`.

**Interfaces:** Registered `plans:create`, `plans:join`, `plans:view`,
`plans:edit`, `plans:history` and `plans:undo`. Creation returns room membership
and a distinct reusable share secret. Join consumes roomId/share secret/name;
all other methods use roomId/member capability. Edits and undo additionally
consume command ID and expected revision; undo identifies a history entry.
View returns accepted plan and revision without secrets. History uses indexed
pagination and returns author, timestamp, summary and changes without tokens.

- [x] Write convex-test cases exercising full state round trips, hash-only token
      storage, reusable link joins, owner/editor distinction, cross-room/viewer denial,
      paginated history, undo/undo-of-undo, dependent conflict and duplicate request
      replay after intervening changes. Confirm failures before implementation.
- [x] Add separate indexed plan/history/receipt/share-link records, preserving
      existing room methods. Reuse existing capability verification rather than
      accepting caller-supplied participant identity. Initialize legacy room plan
      state explicitly; do not silently replace an existing shared plan.
- [x] Implement authenticated transactional edit/undo, full validation and
      atomic receipt/history writes. Use server timestamps and deterministic ordering.
- [x] Run new and existing Convex/room tests plus typecheck; commit.

### Task 3: Room transport, entry dialog and canonical links

**Files:** Create `web/workspace/room-client.ts`, `web/workspace/recent-rooms.ts`,
`web/workspace/RoomEntry.tsx`, `web/routes/room.$roomId.tsx`,
`tests/recent-rooms.test.ts`, `tests/browser/shared-rooms.spec.ts`;
modify `web/routes/index.tsx`. Let the router regenerate its route tree.

**Interfaces:** `roomUrl(origin, roomId, shareSecret): string` is the single URL
formatter for navigation and Share. The room client wraps Convex methods and
subscriptions, exposing accepted plan/revision, load/save errors and membership.
Recent records contain roomId, cached output label, canonical link and last visit;
private membership credentials use a separate browser-storage record.

- [x] Add tests for output names/rates instead of IDs, corrupt/unavailable storage,
      stale labels, direct-link bypass, one dialog on `/`, rejoin, and create navigation.
- [x] Implement validated browser records and session entry. Subscribe/load using
      stored membership or redeem the link into independent membership. Cancel stale
      subscriptions/responses on room changes; clear user-visible secrets from errors.
- [x] Implement configured Convex client and an explicit missing-configuration
      state. Never create a local fake shared room on backend failure.
- [x] Test with a controlled transport fixture plus registered-backend tests;
      verify address-bar/Share URL equality and independent browser memberships.
      Run focused Vitest/Playwright tests and typecheck; commit.

### Task 4: Workspace synchronization, Share and history controls

**Files:** Modify `web/workspace/Workspace.tsx`, `web/workspace/Icon.tsx` and
existing workspace styles; create `web/workspace/RoomHistory.tsx`.
Extend `tests/browser/shared-rooms.spec.ts` and affected existing browser tests.

**Interfaces:** Workspace consumes accepted `SharedPlan`, revision and explicit
edit operations from the room client. `RoomHistory` pages history and requests
undo through the same client. Personal preferences continue existing local storage.

- [x] Add browser tests for full production/layout/unlock synchronization, imports
      as one edit, remote changes without echo writes, preserved drafts on conflict,
      connection failure, stale responses after navigation, history and undo feedback.
- [x] Route accepted planner mutations through explicit shared edits instead of
      post-render autosave effects. Apply subscribed plans without creating history.
      Preserve last accepted plan on rejection and block misleading unsaved actions.
- [x] Replace export with Share, including clipboard failure fallback. Add the
      accessible history panel and conflict states using existing visual tokens.
- [x] Run focused browser tests, existing workspace tests and typecheck; commit.

### Task 5: Verification and Draft delivery

**Files:** Update `README.md`, `docs/local-workspace.md`,
`docs/collaboration-contract.md`, `docs/deployment.md` and a task QA record.

- [x] Document required Convex deployment configuration, canonical links, browser
      membership/recent-room storage, history/undo semantics and live-test limits.
- [x] Run `npm run check`, `npm run test:coverage`, `npm run test:browser` and the
      compiled runtime/browser checks affected by routing/backend integration.
- [x] Inspect current changes for authorization leaks, cross-room writes, unsafe
      migration, undo atomicity and URL secret handling. Resolve findings and rerun
      affected checks; use the required review workflow before declaring completion.
- [x] Commit, push and create/update a Draft PR. Report actual check evidence and
      any missing live Convex verification. Do not merge or deploy.
