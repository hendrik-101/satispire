# Durable collaboration sessions implementation plan

> **For agentic workers:** implement the owned task with test-first verification; do not delegate further.

**Goal:** Restore the full plan after F5 and enable reusable anonymous online session links with scoped live cursors.

**Architecture:** Convex session actions/mutations/query persist validated plan intent and private membership capabilities. A browser transport handles creation/join, subscription, revisioned saves and presence; Workspace hydrates snapshots without overwriting uncommitted drafts. Browser-only fallback is explicitly local when no VITE_CONVEX_URL exists.

**Tech Stack:** Existing Node 24.19.0, React/TanStack, Convex 1.46.0, Zod, Vitest/convex-test, Playwright.

**Spec:** docs/superpowers/specs/2026-10-25-collab-sessions-design.md

## Global constraints

- Preserve existing rooms APIs, planner domain purity and personal view preferences.
- Session URLs are reusable bearer invitations, separate participant capabilities remain private.
- Cursor changes must not solve plans or create edit revisions.
- No Convex deployment credentials or host access are currently configured; do all independent delivery work and report any remaining blocked publication accurately.

## Review focus

- Slow initial joins and subscriptions must not replace an edited plan with defaults.
- Reload during a save must preserve the last acknowledged plan and surface pending persistence.
- Cross-session capabilities and concurrent stale writes must fail atomically.
- Pan/zoom, changed floor, hidden tabs and disconnected clients must not misplace or retain cursors.
- Invalid/blocked browser storage must leave a usable view with an honest persistence status.

### Task 1: Durable Convex sessions

Files: convex/schema.ts, convex/sessions.ts, src/session-plan.ts, tests/sessions.test.ts.
Interface: sessions:create({plan,name}), join({sessionId,name}), read({sessionId,capability}), commit({sessionId,capability,id,expectedRevision,plan}), presence({sessionId,capability,clientId,view,floor,cursor}). Define shared types in src/session-plan.ts. Membership returns sessionId, participantId, capability; read returns revision, plan and active presences. Presence view is production or layout; floor is item ID (string); cursor x/y finite.

- [ ] Add registered-function tests for plan durability, capability verification, joins, conflicts/idempotency, invalid input and presence expiry/scope; run and observe RED.
- [ ] Implement validated full-plan storage with hashed capabilities, random link IDs and separate expiring presence; run targeted tests GREEN.
- [ ] Run full unit suite and typecheck, report exact output.

### Task 2: Browser session transport and cursor surfaces

Files: web/workspace/session.ts, web/workspace/RemoteCursors.tsx, web/workspace/FloorView.tsx, web/workspace/ProductionView.tsx, web/workspace/session.css, tests/session-client.test.ts.
Interface: create browser controller supporting explicit local and online modes, initial plan, onSnapshot/onStatus/onPresence callbacks, start(), commit(plan), setPresence(input), close(). Document exact names/types for the integrating root agent. URL uses ?session=<id>. Use ConvexClient named function references, not generated credentials. Separate per-tab client ID; private membership stored per-session. Snapshot updates only on revision change, presence callbacks separate. FloorView/ProductionView accept optional typed cursor props; SVG points inverse CTM, overlay inside actual SVG.

- [ ] Write lifecycle/storage tests, observe RED, implement and verify GREEN.
- [ ] Add cursor props/surfaces preserving existing behavior without session props.
- [ ] Report interfaces and verification to root; do not edit Workspace.tsx.

### Task 3: Workspace integration, acceptance and delivery

Files: web/workspace/Workspace.tsx, tests/browser/collaboration.spec.ts, vite config/types if needed, README.md, docs/local-workspace.md, docs/collaboration-contract.md.

- [ ] Add F5/URL persistence browser tests and observe RED.
- [ ] Integrate controller hydration and acknowledged saves, with shared unlocks and valid last plan; keep draft and personal selection separate. Display connection/save state and copy session URL control.
- [ ] Verify local F5, missing-session behavior, existing browser suite, online integration tests, npm run check and npm run test:coverage.
- [ ] Commit/push Draft PR, run independent code/security reviews and current-head CI, fix valid findings; promote and request CodeRabbit, squash merge once required gates pass.
- [ ] Verify successful main CI and published artifact; deploy only with configured target/backend access and verify actual public URL. If access remains absent, retain completed merge/artifact and identify precisely what still blocks live publication.

### Task 4: Existing ChatGPT Site adapter (target clarified by user)

- [x] Implement the same session operations with a D1 HTTP adapter and schema migration; verify CAS/caps/auth/body bounds against actual SQL.
- [x] Add HTTP client discovery/subscriptions behind the existing browser transport and verify lifecycle/errors.
- [x] Bundle the workspace into a Sites Worker and run the four online browser acceptance scenarios through actual HTTP/SQLite.
- [ ] Preserve the personal Site identity/audience, generate Drizzle migration metadata, and package the accepted merged source for native publication.
- [ ] Verify successful public deployment and report the actual version and URL.
