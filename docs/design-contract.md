# Workspace design contract

Status: the user approved **A as the floor-centered base**, with the graph from B and side panels available on demand. Both original references were materialized through Library and visually inspected on the PC on 11 October 2026 before UI implementation. The local slice follows the floor-centered dark workspace, optional actual material graph and inspector; it does not claim the illustrated online or physical planning features.

## Visual system

Use a restrained industrial dark interface with background `#171B1F`, panels `#21272C`, inputs `#283038`, lines `#39434C`, primary text `#F1F4F6`, secondary text `#B4BEC7`, and orange `#F39A45` with dark text. Labels use 14 px; metadata never falls below 12 px. Use tabular numerals, spacing of 4/8/12/16/24 px and 4 px corner radii. Avoid slogans, decorative KPIs, glow effects and idle animation.

The 48 px header contains project, connection, participant presence and presentation status. A 44 px toolbar switches production/floors/scaling. Navigation is collapsible at 216 px; the inspector is 320 px. Preserve selection when switching views. Below 1200 px collapse navigation; below 900 px do not force a split view. Provide keyboard navigation and an alternative block list.

## Planning behavior

Show demand at 100%, placed machine count, clock settings and remaining capacity separately. Show Shards per stage, factory and budget. Preview parameter changes before applying them atomically; retain the last valid geometry while calculating. Surface conflicts and missing geometry explicitly.

All floors share one origin and footprint. Overlay floors at exactly the same coordinates. Configure generated blocks rather than dragging individual machines; 16 machines may form rows of 6+5+5. Use physical ports only when verified. The illustrative offset floors and simplified graph in image B are not production or geometry evidence and must not enter the model.

Cursors are visible only in the same view and floor. Following a presenter is opt-in, visibly indicated and cancellable with Escape or a button. Never force fullscreen. Camera/zoom synchronization still requires a decision.

## Rendering and performance

The coordinated research recommends HTML/CSS and SVG as the initial 2D approach. Renderer adapters must consume the pure graph/layout model. Consider Canvas/Konva only when measurements show a bottleneck; no Bevy switch has been approved. Render on changes, cull objects outside the viewport and reduce labels at small zoom. Update collaboration cursors separately. Do not claim performance alongside Satisfactory until measured on the actual device; Bevy can also render reactively.

## Implementation gates

Before image-dependent implementation, materialize the approved original reference in this executor through the supported Library flow and inspect it. The current discovery-package transfer failure is recorded separately. Missing images do not block domain, adapter, CI or local data-contract work.

## Approved flexible workspace and optional flow indicators

The user approved A as the base on 11 October 2026, with the graph from B and side panels available on demand. Provide meaningful view presets plus independent panel toggles. Persist personal arrangement separately from shared factory intent. Switching panels/presets preserves selection, uncommitted draft and zoom where applicable and never itself regenerates the factory. Presenter following must not permanently overwrite personal preferences. Image inspection is completed for this local implementation.

Subtle optional indicators may explain resource flow on visible connections, preferably only the selected chain. They are illustrative, not a time-accurate simulation. Pause them for a hidden tab and `prefers-reduced-motion`; retain static arrows and rate labels. Limit animation to visible connections and run no render loop while disabled. Do not animate machines or backgrounds decoratively. Performance alongside Satisfactory still needs actual measurement.

## Cloud continuation, 11 October 2026

The explicitly authorized Cloud restart preserves PR13 and PR14 and favors implementation over another planning loop. This executor attempted the current supported Library materialization flow for both original images; both byte transfers failed. No guessed URL or bypass was used. The existing visual contract and explicit user direction govern independent UI work. The revised UI has one header, one compact planning row, canvas-local controls and optional panels. Model status prose, exclusions and local game import are absent from normal UI. Physical dimensions and ports are unknown in the current catalog; the canvas is labeled Blockschema. Machine height and height-fit are explicitly excluded from this workspace MVP.

## Explicit visual correction

The user rejected the previous visual implementation while retaining the reduced text and existing functionality. The new candidate uses original industrial schematic machine silhouettes, connected symbolic feed/output ports, junctions, directed row manifolds and a compact east transfer module. Strong orange selection identifies one individual machine and links its stage to the graph and inspector. The desktop planning form is integrated into the header; graph is a bottom tray, inspector follows content height, and mobile secondary settings use a sheet. Following direct parent comparison, mobile starts with a complete-factory fit including the transfer; larger mobile zoom steps, pan and keyboard focus-pan provide a readable working view. Thin blue/orange connections and subtle authored steel shading reduce the heavy pale rails and flat machine surfaces identified in that review. These diagram symbols are not verified physical geometry or game assets. The parent's actual A/B inspection informs the supplied criteria; Cloud byte access remains blocked and does not count as image inspection. See [actual captures and verification](qa/visual-correction-2026-10-11.md). This candidate is not claimed to be user-accepted.

## Readability corrections, 24 October 2026

The user rejected ambiguous transport counts, overlaid labels, floating transfer boxes, and the screen-fixed dot background. Each material now has its own intake. Solid directed paths carry a consistent resource color; color identifies the material, and arrows identify direction. Connection cards state resource, exact rate in Stk./min or m³/min, transport count, Mk. tier, capacity per belt/pipe, and source/destination floor. Only transfers incident to the selected floor appear, as references at connected terminals. Row manifolds remain schematic aggregates rather than individual routed belts. Label bounds reserve clearance from routes.

Machine symbols are longer in the flow direction and attach at their short ends. Renderer ports share normalized positions with their connections. These symbolic proportions and logical placements do not replace verified machine-specific geometry or claim physical buildability.

The world-anchored reference raster uses 8 × 8 m foundations and 0.5 m subdivisions. Fine subdivisions disappear when their projected spacing is too small. Zoom and pan move the grid with the diagram. The visible legend identifies the machine symbols as not to scale; the raster does not turn the schematic into a measured factory floorplan.

Every production target uses the same row with product, quantity per minute, and removal control. Desktop displays the list inline; mobile can collapse or expand the entire list, including the first row. Removing the first row promotes the next without discarding its rate. Duplicate products combine their demand consistently. Export resolves and validates the current draft, including all goals and selected recipes, before serialization. An invalid draft retains the last valid plan and explicitly reports that the exported file contains that plan.

## Individual belts and readable rates

The user's subsequent correction supersedes the aggregate-row rendering above: each colored path now represents one belt or pipe between explicit topology ports. Multiple incoming belts have separate terminal ports and paths of the same resource color. Splitters and mergers are drawn as neutral industrial hubs with inward/outward port chevrons, one port per incident edge; pipes use round junctions. Visible letter placeholders are excluded. Bends and perpendicular crossings do not create junctions. Distinct belts reserve separate tracks rather than overlapping along one segment.

Inputs use disjoint groups of whole machines, each supplied by an individually capacity-checked belt and sequential splitter manifold. This can require more belts than simply rounding aggregate throughput upward. Output collectors merge only up to the selected capacity, then proportionally mix every collector into every target/inter-floor delivery lane through matching splitter/merger trees. This prevents a greedily chosen collector from starving one destination while another collector backs up. Every cross-floor delivery lane matches the receiving floor's intake rate. Uneven rows use serpentine traversal with separate entry/exit tracks. The displayed clock is uniform per machine, derived from the solver's exact utilization. Flow rates describe steady-state demand with ordinary manifold buffering/backpressure; they do not simulate startup. The output mixing network is bounded to 2048 collector/delivery pairs.

Rate displays use decimal commas: 33/2 is shown as 16,5 Stk./min. Terminating decimals up to six decimal places remain exact; other result displays are marked as rounded approximations. Editable fields retain an exact fraction when a rounded decimal would change the plan. Raw text is preserved during typing; formatting applies only when assigning calculated/restored plan values. Calculations, transport capacities, and exported quantities remain exact rationals.

Machine branches attach straight to their own logistics hub. Remaining routes prefer fewer long orthogonal runs, with slight corner rounding in the SVG, rather than micro-jogs at the ports. Shared constants keep enlarged hub envelopes, port endpoints, route obstacles, and label clearance consistent. Connection cards explicitly mark total flow; individual belt loads are placed beside their own routes without covering belts, machines, hubs, or other labels. Band capacities remain visible in the connection cards; overload labels are marked from exact rate/capacity comparisons. In the steel beam example the four machine outputs are each13.125/min, the collectors carry26.25,39.375,52.5/min, and the final destination belts carry36 and16.5/min.

Individual belt amounts are hidden by default. Hover or keyboard focus reveals the corresponding amount; selecting a belt keeps its amount visible until another belt is selected or the selection is cleared. The existing Ansicht menu offers a persisted Bandmengen anzeigen checkbox for displaying all amounts. Older personal preferences retain their layout and default this new setting to off. Selecting a machine opens the inspector with the active recipe, actual input/output rates per machine, and its clock percentage classified as underclocked, normal, or overclocked; stage totals remain separate.

Input sizing offers two scopes: total material consumption across the factory, including internally produced materials, or one selected stage's input. Both multiply every production target by the same exact factor. Total consumption sums machine inputs and excludes direct target delivery of the same material. For the steel example, total ingot consumption is240/min while the beam stage consumes210/min. Sizing that stage to240/min produces60beams/min with four machines at100%; the remaining targets scale by8/7 too. Selecting a stage input in the production overview prepares these controls without applying a calculation.

Sizing controls communicate their action through their own selected values, without visible subheadings or explanatory prose. The mode reads Alle Ziele skalieren auf, followed by amount, transport-specific unit, material, and a combined scope/stage selector. Its options read Verbrauch gesamte Fabrik or Eingang: [stage]. Choosing a stage no longer requires a separate scope dropdown. Accessible field names remain available to assistive technology.

Row-to-row routing evaluates geometry-derived inner column gaps and exterior corridors, packing each resource's lanes together. A bounded deterministic search compares the actual routed candidates by geometry violations, shared tracks, crossings, resource interleaving, bends, length, and bounds. It retains the original routing on ties or regressions. Assigned row-spanning tracks survive local route simplification; terminal approaches remain flexible. This heuristic uses resource identity only for grouping, without material/color-specific rules, and does not claim a global optimum or verified in-game clearance.
