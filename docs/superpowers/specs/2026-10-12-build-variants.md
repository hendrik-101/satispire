# Deterministic build variants

The authorized Cloud continuation extends PR14 at 4cfff722; one active implementer, separate stacked branch, no merge/deployment. Preserve the industrial glyphs, thin blue/orange flows, optional panels, mobile camera, exact production and technology restrictions.

## Shared contract

Supply planning accepts optional `variant` with schemaVersion 1, pattern `alternating` (default) or `fixed`, inputSide/outputSide from west/east/north/south (default west/east), and at most 64 item-keyed floor overrides. Alternating chooses the configured or swapped pair for each stage to minimize the sum of perimeter quarter-turn distances from its manufactured parents’ resolved output sides to its input side; ties prefer the configured pair. Independent source stages use the configured pair. Siblings with the same parents therefore align regardless of unrelated floors. Fixed keeps the configured pair. Explicit overrides take precedence and influence downstream orientation. Conflicting parents can require side changes, which transfers report. Same-side pairs are valid. Overrides replace both sides on a specified manufactured stage; unknown/duplicate overrides fail. Floor order is stable dependency-first with lexical tie breaks, independent of production array order. One stage remains one floor.

Every material input retains identity/rate/supply line count, and whether it arrives externally or from a named source floor. All external inputs share the destination input side. Every actual inter-stage dependency gets one symbolic transfer at a single common perimeter side and slot across its floor span. Choose the side that minimizes the sum of perimeter quarter-turn distances from source output and destination input; ties favor source output, then destination input, then west/east/north/south. Report alignment/side changes explicitly; crossed dependencies and branches cannot be optimized by rotating all machines. This deterministic local heuristic is not a global minimum-crossing or physical-routing claim. No connection is invented for an external feed or an unrelated floor. Target outputs are separate from internal transfers.

Only logical coordinates/topology are supported. Physical footprints/ports remain null. No individual belt planning, clearance, lift dimensions, or verified construction claims. Synthetic `generate_floors` geometry is unchanged; `plan_factory` is the shared supply/build-variant API.

## UI and persistence

One canvas-local details control offers presets plus four side choices, pattern, and optional selected-floor override. Machine art stays upright; schematic feeds/outputs and transfers use domain sides. Fit includes all scene elements; keyboard focus pans to upright machine bounds. Factory variants and rows are included in version-1 plan exports under optional `layout`; old files receive default rows/variant, invalid import preserves the last valid factory. Stale asynchronous imports cannot overwrite newer variant changes.

## Gates

Known-answer tests cover two-plus floors, multiple external inputs, same side, vertical flow, changing directions, dependency fan-out/bypass, malformed overrides and deterministic permutation. Adapter parity covers actual classic MCP and WebMCP with identical variant input. Browser tests exercise selection, presets, import/export, mobile fit/pan/zoom. Capture actual Chromium screenshots. Run check, coverage, browser, audit and CI. External normal Codex and Security reviews must finish on current head before Ready; unresolved/unavailable review keeps Draft. CodeRabbit only afterward and no repeated trigger for missing integration.

Automatic rows fit the largest whole-machine manifold supported by every exact per-machine input and output rate at the selected belt or pipe capacity, then distribute machines evenly across the required rows. Explicit row counts retain their requested meaning and may span multiple transport lanes.
