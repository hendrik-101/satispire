# Shared rooms, history and entry dialog

## Intent and approved behavior

The shared resource is the room. Its complete production plan, layout parameters
and session unlocks are persisted server-side. Participants see accepted changes
live. Every accepted plan change is recorded and can be undone through a new
history entry; existing entries are never erased. Personal view, selection, zoom
and panel preferences remain local. JSON download is replaced by sharing a room.

The user approved this behavior and added the following entry flow:

- A direct visit to `/` opens one entry dialog per page visit, listing recently
  joined rooms using their production outputs rather than room IDs.
- Entries offer rejoining the existing room. Creating a room navigates immediately
  to that room's canonical link. The address bar and Share produce the same link.
- Visiting a room link opens that room without the entry dialog.

## Architecture and alternatives

Extend the existing Convex backend and room authorization/revision checks. This
follows the established architecture and provides transactional writes and live
subscriptions. An additional SQL-backed HTTP collaboration server would duplicate
that foundation and introduce a separate operational dependency. Local storage or
URL-encoded plans cannot provide the requested shared persistent room.

Convex is installed but not provisioned. Implementation can be verified locally
with convex-test; live acceptance requires an actual configured deployment.
No deployment, merge, credentials or infrastructure changes are authorized here.

## Implementation choices

- Use `/room/<roomId>#key=<shareSecret>` as the canonical room URL. The fragment
  carries a random reusable editor invitation, not the owner's membership token.
  Both the creator's address bar and Share use this canonical link. Membership
  capabilities remain private browser storage; the backend stores token hashes.
- A shared link grants editor access, including history and undo. Keep the
  existing owner/editor/viewer checks for existing room methods. Joining through
  the reusable room link creates or recovers a browser's membership; it does not
  consume the existing single-use invitations or expose the owner's authority.
- Record recent rooms in this browser only, after successful creation/join/load.
  Derive display labels from saved target outputs and exact rates, using catalog
  names. Refresh labels from authorized room data on entry; show cached output
  labels on temporary network failure. Empty rooms use `Neuer Raum`, never an ID.
- Store the full validated plan intent: catalog version, production targets,
  imports, recipe choices, technology, layout rows/variant, and session unlocks.
  Generated solver/layout output is derived, not trusted shared input.
- Use explicit accepted edits as history units, not keystrokes, navigation,
  presence or failed requests. Record actor, server timestamp, revision, summary,
  changed fields and sufficient before/after state for reversal.
- Undo is a compensating edit, preserving later unrelated edits. Check that each
  affected field still matches the original edit's after-value; otherwise return
  a visible conflict without writing. Structural changes such as target lists
  are atomic fields. Revalidate the resulting full plan, including dependent
  recipe/unlock constraints, before committing. Undo itself is undoable.
- Use separate indexed history and receipt documents rather than unbounded
  arrays inside a room. Paginate history; never silently delete older changes.
- Each edit/undo checks membership and expected revision atomically. Retried
  command IDs do not duplicate history. Concurrent edits are surfaced as
  conflicts; refreshing must not silently resubmit or overwrite a user's draft.
- Keep the last accepted plan visible during loading or a rejected edit. Show
  connection/save errors truthfully; never claim that local edits were saved.
- Share copies the current canonical room URL with a selectable-link fallback.
  Existing JSON import becomes an ordinary validated shared-plan edit.

## UI and verification constraints

Retain the existing workspace design contract. Add an accessible entry dialog,
Share action and history panel with visible undo/conflict feedback. Room history
must not expose capabilities or invitation secrets. Persisted browser records
are untrusted input and must tolerate unavailable/corrupt storage.

Verify registered Convex transactions, cross-room denial, independent browser
membership, reusable joins, complete plan round trips, selective undo, undo
conflicts, idempotency, concurrent changes, history pagination, output labels,
entry/direct-link navigation and address-bar/Share equality. Existing CLI and
stdio MCP remain local; do not imply remote MCP integration.
