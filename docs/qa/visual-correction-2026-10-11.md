# Visual correction — Cloud evidence, 11 October 2026

This is a reviewable visual correction of the existing workspace from confirmed base b06ae1042ba19160f8278d567e00e8e94e4a70bc. The prior UI was explicitly rejected as a design outcome. Reference A remains the intended direction; the user supplied concrete correction criteria, not approval of this implementation.

## Actual inspected browser images

- [Desktop, panels closed](vanilla-desktop.png): 1440 × 960.
- [Desktop, graph and inspector open](vanilla-panels.png): 1440 × 960.
- [Mobile initial working view](vanilla-mobile.png): 390 × 844.
- [Mobile secondary settings sheet](vanilla-mobile-sheet.png): 390 × 844.
- [Assembler with two connected symbolic feeds](vanilla-assembler.png): 1440 × 960.

All five images were opened and visually inspected in this executor after capture. The first mobile capture failed the visual criterion: a tiny whole factory remained centered in a tall grid. The revised mobile start uses a readable horizontal working window and a shorter content canvas; full overview remains reachable with Einpassen. No claim of pixel-identical reference comparison is made: the supported Library materialization returned references, but both authenticated byte transfers failed again. Neither original A nor B was readable here. The parent has already viewed them and supplied the explicit visual comparison. Original A's exact pixel size was requested but remains unconfirmed; 1440 × 960 is the documented capture size.

## Criteria checked against the actual images

1. **Industrial identities and connection continuity.** Original SVG families represent furnace, construction bed and assembly gantry. Top feed ports, bottom output ports, row junctions, arrows and a compact east transfer symbol form continuous schematic paths. Separate resource inputs produce separate symbolic feeds. These are authored diagram symbols, not game artwork or measured physical ports.
2. **Canvas occupancy and hierarchy.** The 16-Constructor 6+5+5 block uses the available desktop area. The large dashed unused floor/shaft areas were removed; a quiet solid boundary frames occupied content. A single individual machine has the strong orange selection. The same stage is selected in the optional graph; the inspector shows the same family and machine number.
3. **Integrated controls.** Production target, exact rate, calculation and technology share the desktop header. Stage, row variant and view controls sit in one compact canvas row. Title and rate/count metadata float inside the canvas rather than adding full-width title/footer bands. No exclusions, development-status sentences or catalog editing were added.
4. **Content-sized optional panels.** Graph occupies a compact horizontal tray beneath the canvas. Inspector height follows its content and uses the selected machine symbol. No tall empty framed graph/inspector column.
5. **Mobile working view.** Canvas starts below 190 px; row/zoom settings move into an Escape-dismissible sheet. Initial working crop keeps glyphs readable; pointer pan, wheel/button zoom, keyboard focus-pan and Einpassen provide access to the rest. Complete-factory fit is an intentional optional overview, not the initial mobile working scale.

## Functional evidence

Fresh full checks: 309 unit tests plus formatting, lint, strict types, TypeScript build, compiled CLI/MCP smoke and client/server web build. All 21 Chromium cases pass, including four new visual-interaction regressions: coordinated individual selection, compact mobile controls/sheet, off-screen keyboard selection and camera recovery, separate assembler feeds.

The selection regression first failed before wiring the root selection callback. The mobile compact-controls regression first failed with drawing y=228, above its allowed 190 px. The focus-pan regression was also checked red/green by temporarily disabling focus-pan: Constructor 6 remained at x≈506 beyond the visible right edge x=365; restored implementation passes. Existing repeated calculation, invalid/import recovery, interrupted import, profile transaction, alternate recipes, resource-policy handling and live WebMCP cases remain covered.

The independent read-only review found no material selection, profile/import, motion, feed-connectivity or security regression. External Codex normal/Security reviews and GitHub CI still need confirmation against the published new head; this file is evidence of local checks, not external approval.

## Limits and ownership

No domain geometry or supply-capacity calculation was replaced. Shared floor footprint, machine counts, exact rates and technology restrictions remain domain outputs. The renderer fits occupied symbolic content and uses representative aggregate manifold paths; it does not claim individual belt routes, real collision/clearance envelopes, machine height or Height-Fit. Input port positions within the authored symbols are diagram conventions. Actual physical footprint/port fields remain null.

No game assets, new dependencies, Library upload, CodeRabbit retrigger, merge or deployment. The existing feat/local-workspace-ui PR branch is isolated from main and is the sole-owner implementation branch; PR14 was returned to Draft before changes. The known Netcup Ansible project remains hendrik-101/netcup-vps-docker with its separate active owner.
