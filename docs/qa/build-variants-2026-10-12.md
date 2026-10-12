# Build variants verification, 12 October 2026

The isolated `feat/build-variants` branch starts from PR14 `4cfff72276ecaff5b072bb202e64216ee9a709b2`, preserving PR13 `484d9fb` and all published UI work. The later explicit basis-repair instruction was implemented separately in PR14 commit 70b32ac07f17beac9aa2939005e7ed357d24e41a and merged into this branch. The FloorView merge keeps the variant renderer and its equivalent computed transport labels; Workspace fixes merge unchanged. Remote branch/PR enumeration and `git ls-remote --heads origin` found only main, planner-core and local-workspace-ui: no published variants work was duplicated. No repository or ancestor AGENTS.md/.agents skill files were present. Existing project plans, contribution/design/geometry/security contracts were read.

The pure version-1 build variant contract orders stages dependency-first, alternating west/east then east/west by default. Fixed same-side and custom west/east/north/south pairs plus per-stage overrides are shared by UI and `plan_factory` in classic MCP and WebMCP. Every input retains its material/rate/line count and source-floor identity, with null denoting external intake. Transfers exist only for actual dependencies; each has a common side/slot/position across its entire span. Side selection minimizes local endpoint perimeter distance with stable tie-breaking, and reports side changes. It is not a global minimum-crossing or physical routing claim.

The canvas retains the authored upright industrial glyphs, thin colored resource paths, selection, optional panels and mobile fit/pan/zoom. Camera fit bounds include the selected visible block and every spanning transfer, without fitting empty shared-floor margin. One contextual details control holds presets, custom sides and selected-floor exceptions. Full row rails connect every machine when the direction changes. Aggregate labels show required line multiplicity. North-facing output attachments run above the machines. Plan files preserve rows/variants; legacy files receive defaults. Invalid/stale exceptions fail import atomically; normal target changes remove exceptions for stages that disappear. Primary manufactured targets stay focused when the old stage disappears, and recipe choices are limited to feasible chains under the current imports.

## Actual local gates

Node 24.19.0/npm 11.9.0; no dependency changes. `npm ci --cache /tmp/satispire-npm-cache` succeeded after the default home cache proved unwritable.

- `npm run check`: discovery checks, formatting, lint, strict types, 322 unit tests, compiled CLI and real MCP stdio smoke, client/server builds pass.
- `npm run test:coverage`: 95.57% lines, 88.47% branches, 98.54% functions, 94.71% statements; thresholds pass.
- `npm audit --audit-level=high`: zero known vulnerabilities.
- `PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`: all 37 Chromium cases pass after integrating the PR14 repair, including 27 inherited cases, three new base-P2 regressions and seven variant cases.
- `git diff --check`: clean.

Red/green evidence: new domain module and plan-file contract were initially missing; the initial browser cases failed on absent variant-side attributes/control. Pointer interception was diagnosed as inherited `pointer-events:none` on the canvas heading and repaired at the new contextual control. New rail regression initially failed without full-row coverage. A 240/min three-row north-output scenario reproduced an interior crossing and passed after the attachment moved above the machines. The 320/min scenario alone missed that crossing; the regression deliberately retains 240/min. The independent read-only review reproduced a mixed OreIron/Cable import where canvas/selector chose Copper Ingot and Inspector chose Cable. The first OreIron/IronPlate case missed this discrepancy because the lexical and dependency-first fallbacks coincided. The retained regression failed on Copper Ingot instead of Cable, then passed after selecting the first manufactured requested target. A mobile single-machine regression failed at 32.45 px glyph width; the secured pre-integration snapshot still failed at 36.52 px. After reducing an artificial logical floor-width minimum from 80 to 64 while fitting visible bounds, the final single-machine case passes at ≥40 px with its transfer retained. No physical dimensions were changed or claimed. Target deliveries now have distinct rate/line-count metadata and a separate same-side ZIEL terminal; an ingot conservation test verifies aggregate 50 = requested 20 + internal transfer 30.

## Real screenshots

`npm run build` then `node scripts/build-variants-qa.mjs` captures the live loopback app in Chromium, with no page errors. All images were inspected; these are browser captures, not generated mockups.

- [Floor 1, left to right](build-variants-floor-one.png), [floor 2, right to left](build-variants-floor-two.png), 1586 × 992.
- [Same-side input/output](build-variants-same-side.png), [vertical variant](build-variants-vertical.png), 1586 × 992.
- [Multiple dependency inputs](build-variants-multiple-inputs.png), [two external ore inputs, no invented transfer](build-variants-external-inputs.png), 1586 × 992.
- [Mobile complete fit](build-variants-mobile.png), [mobile contextual controls](build-variants-mobile-control.png), 390 × 844.

Physical footprints/ports remain null. Transfer locations and paths are logical diagram topology; no measured lift dimensions, individual belts, clearance, game geometry, online infrastructure or deployment are claimed. `generate_floors` synthetic geometry is unchanged.

External current-head Codex code review, Security review and CI must complete before Ready. No earlier-head or earlier-PR result is current approval. CodeRabbit remains after that gate; an absent integration is not bypassed with repeated comments. No merge or deployment.
