# Workspace design contract

Status: prepared by the coordinator; **UI direction is not yet approved**. Two ImageGen compositions have been shown to the user. Option A centers the floor workspace; option B pairs graph and floor. The coordinator recommends A with an optional split view. Neither image has been materialized or viewed in this executor, so this text is preparation, not screenshot compliance evidence.

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

Before image-dependent implementation, obtain user approval of the chosen composition, materialize the original reference in this executor through the supported Library flow and inspect it. The current discovery-package transfer failure is recorded separately. Neither missing images nor UI approval blocks domain, adapter, CI or local data-contract work.

## Approved flexible workspace and optional flow indicators

The user approved A as the base on 11 October 2026, with the graph from B and side panels available on demand. Provide meaningful view presets plus independent panel toggles. Persist personal arrangement separately from shared factory intent. Switching panels/presets preserves selection, uncommitted draft and zoom where applicable and never itself regenerates the factory. Presenter following must not permanently overwrite personal preferences. Image inspection remains blocked in this executor; approval does not imply the references have been seen.

Subtle optional indicators may explain resource flow on visible connections, preferably only the selected chain. They are illustrative, not a time-accurate simulation. Pause them for a hidden tab and `prefers-reduced-motion`; retain static arrows and rate labels. Limit animation to visible connections and run no render loop while disabled. Do not animate machines or backgrounds decoratively. Performance alongside Satisfactory still needs actual measurement.
