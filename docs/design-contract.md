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
