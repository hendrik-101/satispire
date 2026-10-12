# Collaboration contract

This checkout contains a pure room reducer and registered Convex functions, tested through `convex-test`. It has no deployed Convex URL, online transport integration, connection liveness, or workspace UI. The local application adapter is a single-process test/CLI service. Neither adapter constitutes a delivered online collaboration MVP.

## Identity and capabilities

A room has one owner; invitations grant editor or viewer membership. Owners can edit and issue/revoke invitations, editors can edit and present, and viewers can read, publish their own presence, and opt into following. Neither editors nor viewers can issue invitations. The eight-participant acceptance scenario is a test case, not a room capacity limit; nine participants are also tested.

The domain accepts `RoomContext { roomId, participantId }` only from a trusted server adapter. Tool arguments cannot supply participant IDs or roles. `authorizeRoom`, `readRoom`/`roomView`, and every reducer check that the participant belongs to the requested room. Sharing an ID across rooms does not confer access to either room.

Convex public methods accept a room ID and an opaque membership capability. Verification hashes the capability, looks it up in the private capabilities table, checks its room, and constructs the context from the stored membership. Callers cannot construct that context themselves. `create`, `invite`, and `join` actions generate 256-bit tokens with Web Crypto; deterministic internal mutations store SHA-256 digests and perform membership changes. Invitation roles come from owner-issued invitations. Invitations are single-use; redemption consumes the invite and persists the participant capability in one transaction. Invitation revocation is owner-only. Capability possession grants its recorded membership permissions; transport must keep capabilities private.

The room query returns a detached public snapshot without invitation digests, command receipts, or membership capabilities. Raw tokens are returned only by their creation action, never included in room state. This implementation writes no token logs and constructs no token URLs. Production clients must store membership tokens privately and keep them out of logs, analytics, and URLs; intentional invitation links need their own transport design.

## Planner commands

The envelope is `{ id, expectedRevision, command }`. Supported commands are:

- `{ type: 'set-target', itemId, rate }`: a positive exact integer, decimal, or fraction string; the shared rational parser validates its arithmetic bounds and storage normalizes it.
- `{ type: 'set-block-rows', blockId, rows }`: an integer row count from 1 through 256.

Commands record planner intent, not generated layouts or recipes. The catalog-aware solver and geometry generator validate their own inputs and supported scope. Unknown commands, extra command fields, invalid IDs, reserved property names, invalid rates, and invalid row counts fail without a partial change.

Every edit checks membership and edit permission first. The command ID is room-scoped and bound to participant ID, original payload, and expected revision. A successful identical retry returns its original applied revision and leaves current state unchanged, even after newer edits. Reusing that ID with another participant, payload, or revision is rejected. A fresh command whose expected revision differs from the room's current revision is rejected. The caller must refresh and submit a new command ID after resolving the conflict.

A successful fresh command increments planner revision once and records the receipt together with the intent. The reducer never mutates its input. Convex runs capability verification, revision/receipt checks, and the state replacement within one mutation transaction. Invitation, membership, and presence updates do not increment the planner revision.

## Presence and presentation

Presence consists of the participant's stored name/color and their current view, floor, and optional finite cursor position. Cursors appear only for participants on the observer's same view and floor. `presenceFor` returns that scoped list; public room snapshots also remove cursor positions from other scopes. Presence updates do not create edit conflicts.

Owners and editors may start/stop presenting themselves. Following starts only when a participant explicitly enables it. Followers mirror the presenter's view and floor while preserving their previous location. `follow(false)` is the escape/leave-follow action: it stops following and restores that location. Direct navigation via a presence update also cancels following. When a presenter stops or another presenter starts, current followers are released and their previous locations restored. No command requests fullscreen.

These are backend contracts, not verified keyboard, screen-reader, responsive-layout, or browser-fullscreen behavior. The future UI must wire Escape and visible leave/reset controls to the cancellation action and test those interactions.

## Backend functions and verification boundary

`convex/rooms.ts` registers public `create`, `invite`, `join`, `view`, `command`, `revokeInvitation`, `presence`, `present`, and `follow` functions using Convex's generic server helpers. Its private internal mutations handle token creation results. The schema validates stored room shapes. No generated deployment files or credentials are fabricated.

`tests/convex.test.ts` invokes actual registered actions, queries, and mutations through the library's simulated backend. A virtual test-only generated-path marker supplies the module loader's directory detection; it is not a checked-in generated API. Tests exercise capability hashing, role denial, cross-room denial, invite replay/revocation, nine memberships, revision/idempotency failures, atomic invalid-command rejection, presence scope, and opt-in/escape following. They verify registered function logic, not a live Convex deployment or production network behavior.

Online release still requires a provisioned deployment and transport verification, token storage/recovery/revocation policy, invitation expiry/rate controls, session disconnect/presence expiry, and storage sizing. This first slice stores a room's intent, membership, invitations, and receipts in one document; receipt retention and room-document growth must be designed against deployment limits before production exposure. Existing capabilities have no public rotation or removal endpoint in this slice.
