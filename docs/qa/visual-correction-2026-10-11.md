# Visual correction — Cloud evidence, 11 October 2026

This is a reviewable visual correction of the existing workspace from confirmed base b06ae1042ba19160f8278d567e00e8e94e4a70bc. The prior UI was explicitly rejected as a design outcome. Reference A remains the intended direction; the user supplied concrete correction criteria, not approval of this implementation.

## Actual inspected browser images

- [Desktop, panels closed](vanilla-desktop.png): 1586 × 992.
- [Desktop, graph and inspector open](vanilla-panels.png): 1586 × 992.
- [Mobile initial complete-factory fit](vanilla-mobile.png): 390 × 844.
- [Mobile zoomed working view](vanilla-mobile-zoom.png): 390 × 844.
- [Mobile secondary settings sheet](vanilla-mobile-sheet.png): 390 × 844.
- [Assembler with two connected symbolic feeds](vanilla-assembler.png): 1586 × 992.

All six images were opened and visually inspected in this executor after capture. The first mobile capture failed the visual criterion: a tiny whole factory remained centered in a tall grid. The first revision used a readable horizontal working window. Direct parent review then identified the initially clipped transfer; the current revision starts with the whole block fitted, uses a shorter canvas, and offers larger 1.5× mobile zoom steps for a readable working view. Pan, keyboard focus-pan and Einpassen recover all content. No claim of pixel-identical reference comparison is made: the supported Library materialization returned references, but both authenticated byte transfers failed again. Neither original A nor B was readable here. The parent has already viewed them and supplied the explicit visual comparison. The parent subsequently confirmed original A is exactly 1586 × 992 pixels (PNG, 1,621,060 bytes). Desktop captures now use those exact pixel dimensions. The parent directly compared 8427afb with original A: machine identities, connected ports, selection and occupancy improved, but broad pale triple rails and heavy flat symbols remained weak. The current follow-up replaces those rails with thin blue/orange directed paths, adds subtle authored steel shading and reduces heavy rails. Approval of the follow-up remains pending.

## Criteria checked against the actual images

1. **Industrial identities and connection continuity.** Original SVG families represent furnace, construction bed and assembly gantry. Top feed ports, bottom output ports, row junctions, arrows and a compact east transfer symbol form continuous schematic paths. Separate resource inputs produce separate symbolic feeds. These are authored diagram symbols, not game artwork or measured physical ports.
2. **Canvas occupancy and hierarchy.** The 16-Constructor 6+5+5 block uses the available desktop area. The large dashed unused floor/shaft areas were removed; a quiet solid boundary frames occupied content. A single individual machine has the strong orange selection. The same stage is selected in the optional graph; the inspector shows the same family and machine number.
3. **Integrated controls.** Production target, exact rate, calculation and technology share the desktop header. Stage, row variant and view controls sit in one compact canvas row. Title and rate/count metadata float inside the canvas rather than adding full-width title/footer bands. No exclusions, development-status sentences or catalog editing were added.
4. **Content-sized optional panels.** Graph occupies a compact horizontal tray beneath the canvas. Inspector height follows its content and uses the selected machine symbol. No tall empty framed graph/inspector column.
5. **Mobile working view.** Canvas starts below 190 px; row/zoom settings move into an Escape-dismissible sheet. Initial fit includes the rightmost machines and transfer; two 1.5× zoom steps provide a larger working scale. Pointer pan, wheel/button zoom, keyboard focus-pan and Einpassen provide access and recovery. The canvas height is bounded to avoid a tall empty overview grid.

## Functional evidence

Fresh full checks: 309 unit tests plus formatting, lint, strict types, TypeScript build, compiled CLI/MCP smoke and client/server web build. All 21 Chromium cases pass, including four new visual-interaction regressions: coordinated individual selection, compact mobile controls/sheet, off-screen keyboard selection and camera recovery, separate assembler feeds.

The selection regression first failed before wiring the root selection callback. The mobile compact-controls regression first failed with drawing y=228, above its allowed 190 px. The focus-pan regression was also checked red/green by temporarily disabling focus-pan: Constructor 6 remained at x≈506 beyond the visible right edge x=365; restored implementation passes. The initial-fit regression additionally failed with the transfer right edge at x≈649 beyond the viewport right x=365 before the correction; it passes after fitting all content by default. Existing repeated calculation, invalid/import recovery, interrupted import, profile transaction, alternate recipes, resource-policy handling and live WebMCP cases remain covered.

The independent read-only review found no material selection, profile/import, motion, feed-connectivity or security regression. External Codex normal/Security reviews completed without findings for 8427afb, and CI passed for that commit. The current quality follow-up requires fresh reviews/CI against its published head; this file is evidence of local checks, not external approval.

## Limits and ownership

No domain geometry or supply-capacity calculation was replaced. Shared floor footprint, machine counts, exact rates and technology restrictions remain domain outputs. The renderer fits occupied symbolic content and uses representative aggregate manifold paths; it does not claim individual belt routes, real collision/clearance envelopes, machine height or Height-Fit. Input port positions within the authored symbols are diagram conventions. Actual physical footprint/port fields remain null.

No game assets, new dependencies, Library upload, CodeRabbit retrigger, merge or deployment. The existing feat/local-workspace-ui PR branch is isolated from main and is the sole-owner implementation branch; PR14 was returned to Draft before changes. Infrastructure automation remains outside this application repository and has a separate owner.
