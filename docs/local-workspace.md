# Local workspace

Use Node 24.19.0 and npm 11.9.0 in the existing TanStack Start checkout:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4173. In a sandbox with an unwritable default npm cache, use `npm ci --cache /tmp/satispire-npm-cache`. No Convex credentials or local game installation are required. The project targets Satisfactory 1.2 and runs the pinned [1.2.4.0 / CL 502094 snapshot](data/vanilla.md). Private discovery conversion remains a separate CLI utility for existing developer workflows; it is absent from the normal UI.

Choose an item and exact target rate, then calculate. Technology opens a transactional profile editor for machines, transport tiers, recipe unlocks and alternates. A failed calculation or profile application preserves the last valid plan. Unapplied target/recipe drafts remain separate from the calculated input. Profile shortcuts replace the draft with the selected HUB tier; individual checkboxes customize it. Cancel/Escape discards the profile draft.

The planning mode defaults to **Nach Zielmenge**. Rate fields accept decimal commas, decimal points and exact fractions, such as `7,5`, `7.5` and `15/2`. **Nach Input** offers the external inputs required by the selected target and recipe drafts. Choose an input and its available rate, then calculate to scale the entire chain, preserving the proportions of additional imported targets. For example, standard Modular Frames consume 24 iron ore per frame: 180 iron ore/min produces exactly 7.5 frames/min. Other inputs scale with the chain; this mode sizes against one selected input, rather than optimizing several resource limits. Switching back to the target mode shows the resulting exact output rate. Plan files store the calculated targets, so export/import preserves the sized result; importing starts in target mode.

Unlocks belong to the **session**, and all participants, including viewers, may change them for everyone. Creating a session takes a snapshot of the creator's browser settings; joining an existing session never replaces its unlocks with a participant's defaults. Shared `set-unlocks` commands use the existing revision, identity and idempotency checks. A dialog opened against an older revision must be reopened before applying. The local UI and WebMCP read and edit the same session profile; solver tools use that profile even when a caller supplies different technology.

The editor also records the completed Space Elevator phase (0–5). Phases 0/1/2/3/4 open HUB tiers up to 2/4/6/8/9; phase 5 completes Project Assembly. Selecting a higher HUB preset advances the phase to its minimum; lowering the phase caps the preset and replaces custom unlocks with that tier's defaults. Individual machine, transport and recipe overrides remain available afterward. Phase advancement alone retains individual overrides and does not mark all HUB milestones complete.

Applied profiles are versioned and catalog-bound. `sessionStorage` stores the local session snapshot, while `localStorage` remembers the latest settings in that browser for future session creation. The session snapshot takes precedence over browser defaults when restoring. Invalid or incompatible snapshots fall back to browser settings, then tier 2 defaults; storage failures leave the running session usable and display a notice. Cancelled or rejected profile drafts are never saved. Plan exports include the shared unlock profile and phase; legacy files without that field still import. If a shared command locks a required machine or recipe, the previous plan remains visibly marked as outdated and cannot be exported until recalculated under the current session settings.

The canvas dominates the initial view. Navigation, production graph and inspector are optional. Stage selection, zoom and panel preferences remain personal; no panel toggle recalculates production. Plan import/export preserves every target, recipe override, allowed raw import and applied technology profile. Import seeds other default recipe choices so the user can subsequently change targets. Unsupported catalog versions, oversized files, raw-only layouts and unsupported chains fail before replacing the current plan. New synchronous layout edits invalidate a pending file import; late file reads cannot overwrite newer intent.

Rows can be automatic or selected. Supply/manifold blocks show all supported machine instances and exact line counts; all schematic floors share their area. The inspector displays licensed upstream machine bounds and hard-clearance dimensions for five machines, plus source attribution and complete MIT notices. Source-local conveyor ports are separate metadata; canvas routing, physical packing and height-fit remain schematic or unsupported. Other machines retain unknown geometry. Optional selected-edge flow indicators pause for hidden tabs and reduced motion. Online mode is available when a Convex deployment is configured; local mode does not send data to an online backend. Provisioning and live publication require deployment access.

Plan files bind the exact catalog version. Older 1.0 plans are rejected with the current 1.2.4.0 version shown, preserving the last valid plan; they are not silently reinterpreted. Planning uses default 1× recipe costs and explicitly rejects unsupported recipe-cost/world modifiers.

Run `npm run check`, `npm run test:coverage` and `PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`. Capture repeatable screenshots with `node scripts/browser-qa.mjs` while the dev server is running. Browser QA covers repeated calculations, invalid-demand recovery, atomic profile application/cancel, multi-target import/export, alternate recipes, interrupted imports, mobile keyboard operation and reduced motion. Compiled CLI output is `dist`; client/server web output is `web-dist`.

## Durable sessions and online collaboration

The root page restores the latest session in this browser or creates a random session identifier and updates the address to `?session=<identifier>`. A successful calculation, plan import, layout edit or applied unlock change saves the complete session plan. F5 restores calculated targets and recipe choices; uncalculated form drafts remain personal and are not saved as shared intent. Personal panels, selection and camera do not move other participants.

Without a hosted session API or `VITE_CONVEX_URL`, the header says **Lokal** and saves to browser localStorage keyed by session. Unknown local links display an error instead of silently creating unrelated content. These links work only in the browser that stores that session. Blocked storage is reported and the current view remains usable; it cannot promise recovery after reload.

To enable collaboration, deploy `convex/` to a dedicated hosted or self-hosted Convex backend using its configured deploy credentials, then supply its **public client URL** to Vite:

```sh
VITE_CONVEX_URL=https://your-convex-client-endpoint npm run dev
# For the compiled runtime, supply the same public URL at build time:
VITE_CONVEX_URL=https://your-convex-client-endpoint APP_REVISION=$(git rev-parse HEAD) npm run build:runtime
```

`VITE_CONVEX_URL` is public configuration, never an admin credential. HTTPS is required except for loopback development endpoints. Existing Convex deploy credentials belong in the deployment environment, never in `VITE_` variables or committed files. Do not point Satispire at another application's backend. Restart/rebuild after changing the client URL.

An online URL is a reusable, unlisted invitation. Anyone possessing it may join, read and change this session; share it only with intended collaborators. Each browser receives a separate private membership credential, which never enters the URL. The header's copy control copies the address-bar session link. Joined sessions keep the creator's saved plan and unlocks rather than replacing them with the joining browser's defaults.

The status distinguishes pending writes, confirmed saves, connection loss, storage failures and conflicts. Concurrent stale writes are rejected; the unsaved local result stays visible with a conflict message until reload. Pending online saves trigger the browser's leave-page confirmation. The Site HTTP transport automatically retries temporary connection/server failures with the same command ID, revision and plan, so a lost acknowledgement cannot double-apply a change. A remote update refreshes the calculated result while preserving an uncommitted local form draft.

Cursors are separate from plan updates. They appear only on the same floor/item or production view, respect independent pan/zoom, clear on pointer leave or hidden tabs, and expire after 15 seconds without heartbeat. No presenter/camera following is introduced. The server retains 128 retry receipts per session, permits 128 browser memberships and eight simultaneous cursor clients per membership. New-session creation is limited to five attempts per minute and 512 durable sessions per deployment; existing sessions remain accessible at those limits. Saved plans are not automatically deleted. This is separate from the older rooms API's uncapped participant model.

Online browser acceptance uses a real running Convex backend (not a browser mock):

```sh
VITE_CONVEX_URL=http://127.0.0.1:3210 SATISPIRE_TEST_ONLINE=1 PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/browser/online-collaboration.spec.ts
```

The ordinary browser suite exercises explicit local persistence; `tests/sessions.test.ts` exercises registered server functions and authorization through convex-test. A successful local online test does not prove external HTTPS deployment.

### ChatGPT Sites hosting

The Sites Worker serves the same exported workspace plus same-origin JSON session operations backed by the Site's managed D1 database. `GET /api/session-config` advertises this transport; private membership credentials remain in POST bodies. Separate plan and presence polling pauses for hidden tabs and prevents overlapping requests. Plan writes retain the same revision and idempotency contracts as Convex. The Worker uses the checked-in schema migration and never creates schema while handling requests.

`npm run build:site` produces the generic Worker in `site-dist/server/index.js` with embedded immutable assets; it does not register or publish a Site. Personal deployment identity and binding configuration stay in the existing Site source repository. The build accepts `--manifest <hosting.json>` and `--migrations <generated-drizzle-directory>` for its existing identity and generated schema metadata when packaging for native Sites publication. Never substitute a new project ID for the existing Site.

`npm run test:browser:site` builds this Worker and runs the online browser suite through a real HTTP listener backed by SQLite. This exercises actual fetches and SQL, separate browser identities, reload, scoped world-coordinate cursors and collaborative draft races. Hosted D1 migration and public networking are additionally verified during publication.
