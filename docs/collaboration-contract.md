# Collaboration contract

Session-wide unlocks are an optional `RoomState.unlocks` profile, independent of participant identity. `rooms:create` accepts the creator's browser profile as `unlocks` and snapshots it; omission uses the tier 2 default. Invites and joins preserve that snapshot. Every verified member may submit a `set-unlocks` command through `rooms:command`, including viewers; other edit commands retain their existing role restrictions. Unlock changes increment the shared revision and participate in command receipts and stale-edit rejection. Existing stored rooms without an unlock profile remain readable. The workspace persists the complete session plan and unlock profile through the first-feature session API; external deployment still requires configuration.

This checkout contains a pure room reducer and registered Convex functions, tested through `convex-test`. The workspace now uses the first-feature session API described below when VITE_CONVEX_URL is configured. The older local application adapter remains a single-process test/CLI service. No external Convex deployment is assumed or provisioned by this code.

## Identity and capabilities

A room has one owner; invitations grant editor or viewer membership. Owners can edit and issue/revoke invitations, editors can edit and present, and viewers can read, publish their own presence, and opt into following. Neither editors nor viewers can issue invitations. The eight-participant acceptance scenario is a test case, not a room capacity limit; nine participants are also tested.

The domain accepts `RoomContext { roomId, participantId }` only from a trusted server adapter. Tool arguments cannot supply participant IDs or roles. `authorizeRoom`, `readRoom`/`roomView`, and every reducer check that the participant belongs to the requested room. Sharing an ID across rooms does not confer access to either room.

Convex public methods accept a room ID and an opaque membership capability. Verification hashes the capability, looks it up in the private capabilities table, checks its room, and constructs the context from the stored membership. Callers cannot construct that context themselves. `create`, `invite`, and `join` actions generate 256-bit tokens with Web Crypto; deterministic internal mutations store SHA-256 digests and perform membership changes. Invitation roles come from owner-issued invitations. Invitations are single-use; redemption consumes the invite and persists the participant capability in one transaction. Invitation revocation is owner-only. Capability possession grants its recorded membership permissions; transport must keep capabilities private.

The room query returns a detached public snapshot without invitation digests, command receipts, or membership capabilities. Raw tokens are returned only by their creation action, never included in room state. This implementation writes no token logs and constructs no token URLs. Production clients must store membership tokens privately and keep them out of logs, analytics, and URLs; intentional invitation links need their own transport design.

## Planner commands

The envelope is `{ id, expectedRevision, command }`. Supported commands are:

- `{ type: 'set-target', itemId, rate }`: a positive exact integer, decimal, or fraction string; the shared rational parser validates its arithmetic bounds and storage normalizes it.
- `{ type: 'set-block-rows', blockId, rows }`: an integer row count from 1 through 256.
- `{ type: 'set-unlocks', profile }`: a validated, versioned Vanilla session unlock profile; every member may change it.

Commands record planner intent, not generated layouts or recipes. The catalog-aware solver and geometry generator validate their own inputs and supported scope. Unknown commands, extra command fields, invalid IDs, reserved property names, invalid rates, and invalid row counts fail without a partial change.

Every command checks membership first; planner edits additionally require edit permission, while unlock changes are allowed for all members. The command ID is room-scoped and bound to participant ID, original payload, and expected revision. A successful identical retry returns its original applied revision and leaves current state unchanged, even after newer edits. Reusing that ID with another participant, payload, or revision is rejected. A fresh command whose expected revision differs from the room's current revision is rejected. The caller must refresh and submit a new command ID after resolving the conflict.

A successful fresh command increments planner revision once and records the receipt together with the intent. The reducer never mutates its input. Convex runs capability verification, revision/receipt checks, and the state replacement within one mutation transaction. Invitation, membership, and presence updates do not increment the planner revision.

## Presence and presentation

Presence consists of the participant's stored name/color and their current view, floor, and optional finite cursor position. Cursors appear only for participants on the observer's same view and floor. `presenceFor` returns that scoped list; public room snapshots also remove cursor positions from other scopes. Presence updates do not create edit conflicts.

Owners and editors may start/stop presenting themselves. Following starts only when a participant explicitly enables it. Followers mirror the presenter's view and floor while preserving their previous location. `follow(false)` is the escape/leave-follow action: it stops following and restores that location. Direct navigation via a presence update also cancels following. When a presenter stops or another presenter starts, current followers are released and their previous locations restored. No command requests fullscreen.

These are backend contracts, not verified keyboard, screen-reader, responsive-layout, or browser-fullscreen behavior. The future UI must wire Escape and visible leave/reset controls to the cancellation action and test those interactions.

## Backend functions and verification boundary

`convex/rooms.ts` registers public `create`, `invite`, `join`, `view`, `command`, `revokeInvitation`, `presence`, `present`, and `follow` functions using Convex's generic server helpers. Its private internal mutations handle token creation results. The schema validates stored room shapes. No generated deployment files or credentials are fabricated.

`tests/convex.test.ts` invokes actual registered actions, queries, and mutations through the library's simulated backend. A virtual test-only generated-path marker supplies the module loader's directory detection; it is not a checked-in generated API. Tests exercise capability hashing, role denial, cross-room denial, invite replay/revocation, nine memberships, revision/idempotency failures, atomic invalid-command rejection, presence scope, and opt-in/escape following. They verify registered function logic, not a live Convex deployment or production network behavior.

Online release still requires a provisioned deployment and transport verification, token storage/recovery/revocation policy, invitation expiry/rate controls, session disconnect/presence expiry, and storage sizing. This first slice stores a room's intent, membership, invitations, and receipts in one document; receipt retention and room-document growth must be designed against deployment limits before production exposure. Existing capabilities have no public rotation or removal endpoint in this slice.

## First-feature workspace sessions

`convex/sessions.ts` implements the first browser collaboration feature separately from the older role/invitation API. `sessions:create` accepts a validated complete PlanFile and participant name. It generates a random 256-bit session identifier and a distinct 256-bit private participant capability. The identifier is an intentional reusable bearer invitation in the address-bar URL; `sessions:join` grants edit membership to anyone possessing it. There is no public listing. The older rooms API's single-use viewer/editor invitations and owner permissions are unchanged and are not implied for these shared-link sessions.

Only SHA-256 capability digests are stored server-side. `read`, `commit`, `presence` and `peers` require a capability belonging to the specified session. Reads expose revision and plan; peers expose only participant display properties and scoped presence, never membership credentials or retry receipts. Participant capabilities live separately in per-session browser storage. Clearing that storage loses the private identity; a still-valid session link can create a new membership.

Full plans are validated against the pinned catalog, production solver and layout generator before storage. Maximum plan size is 256 KiB. `commit` atomically checks expectedRevision and a participant-bound command ID/fingerprint, increments once and retains the newest 128 receipts. Identical retained retries return the original revision; changed payloads or other participants cannot reuse a command ID. Older unretained retries conflict rather than replay. The last valid calculated plan may refer to older technology than the current unlock profile; the workspace marks it outdated until recalculation, matching existing unlock behavior.

Session memberships are capped at 128, separately from the legacy rooms API. Presence has at most eight clients per membership and is stored in a separate indexed table. Cursor writes never increment plan revision or regenerate production. A single scheduled expiry per client follows heartbeat updates and deletes inactive presence after 15 seconds. Queries additionally filter by age, view and floor/item ID; clients filter expired results too. Diagram cursors use SVG world coordinates and production-table cursors use normalized panel coordinates. Local camera and selection remain personal.

The browser serializes saves using acknowledged revisions, defers subscription changes during pending saves and latches stale-write conflicts without overwriting the unsaved result. Memberships and complete local fallback plans are keyed by session; the root reopens the browser's most recent session. With no public Convex URL, local persistence is explicitly labeled and does not claim remote sharing. Cross-browser acceptance must run against an actual backend; localStorage and convex-test alone do not prove deployed networking.

External publication requires a dedicated backend with the registered functions, a public HTTPS client endpoint configured as VITE_CONVEX_URL at frontend build time, and a reachable app deployment. Domain names, host capacity, credentials, backup/retention, service monitoring and actual public HTTP/browser verification remain operator deployment concerns. The user authorized merge and publication for this change; missing target/access is an execution prerequisite rather than a renewed approval gate.

## Sites HTTP/D1 adapter

`src/runtime/site-sessions.ts` implements the same create/join/read/commit/presence/peers operations as the Convex session adapter. POST JSON endpoints are rooted at `/api/sessions/`; membership capabilities never enter request URLs. Requests enforce JSON content, same-origin browser headers and a streamed 300 KiB maximum. API responses are uncached and suppress stack traces. D1 prepared statements bind all values.

A plan and its bounded receipt window update together with a revision-conditional SQL UPDATE. Competing updates cannot both win. Joining and registering cursor clients use count-limited conditional INSERT statements, enforcing limits atomically. Presence writes do not load/serialize plans; queries remove inactive peers after 15 seconds and expired rows are deleted opportunistically. SQL schema changes are shipped as migrations, not runtime DDL. SQLite tests include separate handles on the same persisted file and concurrent updates.

The `createSitesWorker` wrapper serves an immutable export plus session config/API. Personal Site identity, D1 binding declaration and generated Drizzle metadata belong to the Site checkout, separate from the upstream application repository. The generic Node/container listener remains a local-mode transport unless configured for Convex; the Sites Worker supplies a same-origin online option without separately provisioned Convex credentials.
