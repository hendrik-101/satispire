# Local workspace

Use Node 24.19.0 and npm 11.9.0 in the existing TanStack Start checkout:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4173/local for offline planning. The home page at `/` is the shared-room entry dialog; existing `/?session=<64hex>` links still open the session workspace. `/session` creates or restores the existing persistent session workspace, with online sharing and cursors when its backend is available. `/local` stays browser-only even when online backends are configured. In a sandbox with an unwritable default npm cache, use `npm ci --cache /tmp/satispire-npm-cache`. No Convex credentials or local game installation are required. The project targets Satisfactory 1.2 and runs the pinned [1.2.4.0 / CL 502094 snapshot](data/vanilla.md). Private discovery conversion remains a separate CLI utility for existing developer workflows; it is absent from the normal UI.

Choose an item and exact target rate, then calculate. Technology opens a transactional profile editor for machines, transport tiers, recipe unlocks and alternates. A failed calculation or profile application preserves the last valid plan. Unapplied target/recipe drafts remain separate from the calculated input. Profile shortcuts replace the draft with the selected HUB tier; individual checkboxes customize it. Cancel/Escape discards the profile draft.

The planning mode defaults to **Nach Zielmenge**. Rate fields accept decimal commas, decimal points and exact fractions, such as `7,5`, `7.5` and `15/2`. **Nach Input** offers the external inputs required by the selected target and recipe drafts. Choose an input and its available rate, then calculate to scale the entire chain, preserving the proportions of additional imported targets. For example, standard Modular Frames consume 24 iron ore per frame: 180 iron ore/min produces exactly 7.5 frames/min. Other inputs scale with the chain; this mode sizes against one selected input, rather than optimizing several resource limits. Switching back to the target mode shows the resulting exact output rate. Plan files store the calculated targets, so export/import preserves the sized result; importing starts in target mode.

In the existing local/legacy room adapter, unlocks belong to the **session**, and all participants, including viewers, may change them. In shared rooms, full-plan edits, including unlock changes, require editor or owner access. Creating a session takes a snapshot of the creator's browser settings; joining an existing session never replaces its unlocks with a participant's defaults. Legacy `set-unlocks` commands use the existing revision, identity and idempotency checks; shared rooms apply unlocks through validated full-plan edits. A dialog opened against an older revision must be reopened before applying. The local UI and WebMCP read and edit the same session profile; solver tools use that profile even when a caller supplies different technology.

The editor also records the completed Space Elevator phase (0–5). Phases 0/1/2/3/4 open HUB tiers up to 2/4/6/8/9; phase 5 completes Project Assembly. Selecting a higher HUB preset advances the phase to its minimum; lowering the phase caps the preset and replaces custom unlocks with that tier's defaults. Individual machine, transport and recipe overrides remain available afterward. Phase advancement alone retains individual overrides and does not mark all HUB milestones complete.

Applied profiles are versioned and catalog-bound. `sessionStorage` stores the local session snapshot, while `localStorage` remembers the latest settings in that browser for future session creation. The session snapshot takes precedence over browser defaults when restoring. Invalid or incompatible snapshots fall back to browser settings, then tier 2 defaults; storage failures leave the running session usable and display a notice. Cancelled or rejected profile drafts are never saved. Plan exports include the shared unlock profile and phase; legacy files without that field still import. In local and first-feature session workspaces, an unlock change that locks a required machine or recipe leaves the previous plan visibly marked as outdated and unavailable for export until recalculation. The full-plan shared-room API instead validates technology and unlocks together and rejects inconsistent edits.

The canvas dominates the initial view. Navigation, production graph and inspector are optional. Stage selection, zoom and panel preferences remain personal; no panel toggle recalculates production. Plan import/export preserves every target, recipe override, allowed raw import and applied technology profile. Import seeds other default recipe choices so the user can subsequently change targets. Unsupported catalog versions, oversized files, raw-only layouts and unsupported chains fail before replacing the current plan. New synchronous layout edits invalidate a pending file import; late file reads cannot overwrite newer intent.

Rows can be automatic or selected. Supply/manifold blocks show all supported machine instances and exact line counts; all schematic floors share their area. The inspector displays licensed upstream machine bounds and hard-clearance dimensions for five machines, plus source attribution and complete MIT notices. Source-local conveyor ports are separate metadata; canvas routing, physical packing and height-fit remain schematic or unsupported. Other machines retain unknown geometry. Optional selected-edge flow indicators pause for hidden tabs and reduced motion. Online mode is available when a Convex deployment is configured; local mode does not send data to an online backend. Provisioning and live publication require deployment access.

Plan files bind the exact catalog version. Older 1.0 plans are rejected with the current 1.2.4.0 version shown, preserving the last valid plan; they are not silently reinterpreted. Planning uses default 1× recipe costs and explicitly rejects unsupported recipe-cost/world modifiers.

Run `npm run check`, `npm run test:coverage` and `PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`. Capture repeatable screenshots with `node scripts/browser-qa.mjs` while the dev server is running. Browser QA covers repeated calculations, invalid-demand recovery, atomic profile application/cancel, multi-target import/export, alternate recipes, interrupted imports, mobile keyboard operation and reduced motion. Compiled CLI output is `dist`; client/server web output is `web-dist`.

## Shared rooms

At `/`, one modal entry dialog lists this browser's last 30 successfully visited
rooms, newest first, labelled with output names and exact rates. Cached labels
are refreshed through authorized room queries when available. Creating a room
immediately navigates to `/room/<roomId>#key=<shareSecret>`. The address bar, Share
and the selectable link field all use that same canonical URL. A direct room
link bypasses the entry dialog. Membership capabilities are stored separately
from recent-room records and are never copied into the share URL.

Rooms persist production targets, imports, recipe choices, technology, layout
rows/variants and unlocks. Accepted edits appear live for participants. Drafts,
selection, zoom and panels stay personal. Incoming room updates do not create
history entries. A draft based on an older revision cannot silently replace
someone else's newer edit; the draft remains visible and **Aktuellen Stand
übernehmen** explicitly replaces it with the accepted room state. A successful
independent row/variant edit by the same participant advances a current draft's
base revision when the acknowledged snapshot contains exactly that local edit.
It cannot clear an earlier or concurrently received collaborator conflict.

**Historie** lists author, time and changed fields. **Rückgängig** appends a
compensating edit without removing existing entries. Unrelated later changes
remain; overlapping changes or dependent invalid production cause a visible
conflict. History loads in pages of 20, including older entries on request.
JSON import is one validated shared edit; Share replaces the shared-room JSON
export action. The offline `/local` route retains file export and the local
WebMCP adapter. Shared mode does not register a misleading local WebMCP room. It uses the external shared adapter directly, bypassing the separate session controller, session autosave and local room adapter.

Storage failures leave the open room usable and show a reminder to preserve its
link; clipboard failures leave a selectable link. An unavailable backend shows a
connection error instead of claiming local data was saved. See
[backend configuration](deployment.md#shared-room-backend-configuration).

## Durable sessions and online collaboration

`/session` restores the latest session in this browser or creates a random session identifier and updates the address to `/session?session=<identifier>`. Existing root `/?session=<64hex>` links use the same workspace and remain valid; the root without a session identifier opens the shared-room entry dialog. A successful calculation, plan import, layout edit or applied unlock change saves the complete session plan. F5 restores calculated targets and recipe choices; uncalculated form drafts remain personal and are not saved as shared intent. Personal panels, selection and camera do not move other participants.

Without a hosted session API or `VITE_CONVEX_URL`, the header says **Lokal** and saves to browser localStorage keyed by session. Unknown local links display an error instead of silently creating unrelated content. These links work only in the browser that stores that session. Blocked storage is reported and the current view remains usable; it cannot promise recovery after reload.

The Sites Worker uses its managed D1/HTTP adapter and supports anonymous session creation when deployed. The optional Convex backend requires trusted authenticated identity for creation; existing link/capability-based joins remain anonymous-compatible. An operator must integrate the identity provider for new Convex sessions or provision a session through an authenticated client first. Merely setting a client URL does not provision identity. To connect the browser to an existing dedicated Convex backend, supply its **public client URL** to Vite:

```sh
VITE_CONVEX_URL=https://your-convex-client-endpoint npm run dev
# For the compiled runtime, supply the same public URL at build time:
VITE_CONVEX_URL=https://your-convex-client-endpoint APP_REVISION=$(git rev-parse HEAD) npm run build:runtime
```

`VITE_CONVEX_URL` is public configuration, never an admin credential. HTTPS is required except for loopback development endpoints. Existing Convex deploy credentials belong in the deployment environment, never in `VITE_` variables or committed files. Do not point Satispire at another application's backend. Restart/rebuild after changing the client URL.

An online URL is a reusable, unlisted invitation. Anyone possessing it may join, read and change this session; share it only with intended collaborators. Each browser receives a separate private membership credential, which never enters the URL. The header's copy control copies the address-bar session link. Joined sessions keep the creator's saved plan and unlocks rather than replacing them with the joining browser's defaults.

The status distinguishes pending writes, confirmed saves, connection loss, storage failures and conflicts. Concurrent stale writes are rejected; the unsaved local result stays visible with a conflict message until reload. Pending online saves trigger the browser's leave-page confirmation. The Site HTTP transport automatically retries temporary connection/server failures with the same command ID, revision and plan, so a lost acknowledgement cannot double-apply a change. A remote update refreshes the calculated result while preserving an uncommitted local form draft.

Cursors are separate from plan updates. They appear only on the same floor/item or production view, respect independent pan/zoom, clear on pointer leave or hidden tabs, and expire after 15 seconds without heartbeat. No presenter/camera following is introduced. The server retains 128 retry receipts per session, permits 128 browser memberships and eight simultaneous cursor clients per membership. New-session creation is limited to five attempts per minute per trusted caller and 512 durable sessions per deployment; existing sessions remain accessible at those limits. Saved plans are not automatically deleted. This is separate from the older rooms API's uncapped participant model.

Online browser acceptance uses a real running Convex backend (not a browser mock):

```sh
VITE_CONVEX_URL=http://127.0.0.1:3210 SATISPIRE_TEST_ONLINE=1 PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/browser/online-collaboration.spec.ts
```

The ordinary browser suite exercises explicit local persistence; `tests/sessions.test.ts` exercises registered server functions and authorization through convex-test. A successful local online test does not prove external HTTPS deployment.

### ChatGPT Sites hosting

The Sites Worker serves the exported workspace plus same-origin JSON session operations backed by the Site's managed D1 database. `GET /api/session-config` advertises this transport; private membership credentials remain in POST bodies. Separate plan and presence polling pauses for hidden tabs and prevents overlapping requests. Plan writes retain the same revision and idempotency contracts as Convex. The Worker uses the checked-in schema migration and never creates schema while handling requests. This transport supports `/session` and existing `?session=` links, not the `/room/` full-plan/history contract; shared rooms need a separately configured compatible Convex endpoint.

`npm run build:site` produces the generic Worker in `site-dist/server/index.js` with embedded immutable assets; it does not register or publish a Site. Personal deployment identity and binding configuration stay in the existing Site source repository. The build accepts `--manifest <hosting.json>` and `--migrations <generated-drizzle-directory>` for its existing identity and generated schema metadata when packaging for native Sites publication. Never substitute a new project ID for the existing Site.

`npm run test:browser:site` builds this Worker and runs the online browser suite through a real HTTP listener backed by SQLite. This exercises actual fetches and SQL, separate browser identities, reload, scoped world-coordinate cursors and collaborative draft races. Hosted D1 migration and public networking are additionally verified during publication.
