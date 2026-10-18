# Local workspace

Use Node 24.19.0 and npm 11.9.0 in the existing TanStack Start checkout:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4173. In a sandbox with an unwritable default npm cache, use `npm ci --cache /tmp/satispire-npm-cache`. No Convex credentials or local game installation are required. The project targets Satisfactory 1.2 and runs the pinned [1.2.4.0 / CL 502094 snapshot](data/vanilla.md). Private discovery conversion remains a separate CLI utility for existing developer workflows; it is absent from the normal UI.

Choose an item and exact target rate, then calculate. Technology opens a transactional profile editor for machines, transport tiers, recipe unlocks and alternates. A failed calculation or profile application preserves the last valid plan. Unapplied target/recipe drafts remain separate from the calculated input. Profile shortcuts replace the draft with the selected HUB tier; individual checkboxes customize it. Cancel/Escape discards the profile draft.

Unlocks belong to the **session**, and all participants, including viewers, may change them for everyone. Creating a session takes a snapshot of the creator's browser settings; joining an existing session never replaces its unlocks with a participant's defaults. Shared `set-unlocks` commands use the existing revision, identity and idempotency checks. A dialog opened against an older revision must be reopened before applying. The local UI and WebMCP read and edit the same session profile; solver tools use that profile even when a caller supplies different technology.

The editor also records the completed Space Elevator phase (0–5). Phases 0/1/2/3/4 open HUB tiers up to 2/4/6/8/9; phase 5 completes Project Assembly. Selecting a higher HUB preset advances the phase to its minimum; lowering the phase caps the preset and replaces custom unlocks with that tier's defaults. Individual machine, transport and recipe overrides remain available afterward. Phase advancement alone retains individual overrides and does not mark all HUB milestones complete.

Applied profiles are versioned and catalog-bound. `sessionStorage` stores the local session snapshot, while `localStorage` remembers the latest settings in that browser for future session creation. The session snapshot takes precedence over browser defaults when restoring. Invalid or incompatible snapshots fall back to browser settings, then tier 2 defaults; storage failures leave the running session usable and display a notice. Cancelled or rejected profile drafts are never saved. Plan exports include the shared unlock profile and phase; legacy files without that field still import. If a shared command locks a required machine or recipe, the previous plan remains visibly marked as outdated and cannot be exported until recalculated under the current session settings.

The canvas dominates the initial view. Navigation, production graph and inspector are optional. Stage selection, zoom and panel preferences remain personal; no panel toggle recalculates production. Plan import/export preserves every target, recipe override, allowed raw import and applied technology profile. Import seeds other default recipe choices so the user can subsequently change targets. Unsupported catalog versions, oversized files, raw-only layouts and unsupported chains fail before replacing the current plan. New synchronous layout edits invalidate a pending file import; late file reads cannot overwrite newer intent.

Rows can be automatic or selected. Supply/manifold blocks show all supported machine instances and exact line counts; all schematic floors share their area. The inspector displays licensed upstream machine bounds and hard-clearance dimensions for five machines, plus source attribution and complete MIT notices. Source-local conveyor ports are separate metadata; canvas routing, physical packing and height-fit remain schematic or unsupported. Other machines retain unknown geometry. Optional selected-edge flow indicators pause for hidden tabs and reduced motion. No online backend, collaboration provisioning, VPS or production deployment is claimed.

Plan files bind the exact catalog version. Older 1.0 plans are rejected with the current 1.2.4.0 version shown, preserving the last valid plan; they are not silently reinterpreted. Planning uses default 1× recipe costs and explicitly rejects unsupported recipe-cost/world modifiers.

Run `npm run check`, `npm run test:coverage` and `PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`. Capture repeatable screenshots with `node scripts/browser-qa.mjs` while the dev server is running. Browser QA covers repeated calculations, invalid-demand recovery, atomic profile application/cancel, multi-target import/export, alternate recipes, interrupted imports, mobile keyboard operation and reduced motion. Compiled CLI output is `dist`; client/server web output is `web-dist`.
