# Personal view state

`src/domain/view-preferences.ts` provides pure immutable functions for the approved flexible workspace concept. It contains no UI, browser storage, renderer, shared factory model, solver, geometry, network, or credential operations. It does not establish screenshot compliance; the original images still need transfer and inspection before image-dependent implementation.

## Persistent preferences

`ViewPreferences` is the complete schema-version-1 persistence record:

```json
{
  "schemaVersion": 1,
  "preset": "floors",
  "panels": { "navigation": true, "inspector": true, "graph": false },
  "camera": { "zoom": 1, "origin": { "x": 0, "y": 0 } }
}
```

Presets are `floors`, `production`, and `split`. The navigation, inspector, and graph panels are independently optional. Selecting a preset changes only the preset; it does not force panel changes. The camera is personal, with finite zoom from 0.05 through 20 and finite x/y origin coordinates from −1000000000 through 1000000000. These are application validation limits, not game measurements.

`defaultViewPreferences` is frozen, including its nested objects. `validateViewPreferences(unknown)` accepts a decoded JSON-compatible preference object and returns a detached, validated copy. The schema rejects unknown keys at every level, missing fields, unsupported versions, invalid presets, nonboolean panel values, and invalid camera values. Shared factory data is not an allowed preference field.

`restorePreferences(unknown)` validates a decoded saved value and returns fresh defaults when the record is malformed or uses an unsupported version. It does not parse storage strings or perform a migration. `updateViewPreferences(current, change)` accepts partial preset, panel, and camera changes, merges them without mutating current values, and validates the change. Camera origin coordinates can be updated separately. Unchanged panels and camera retain their object identity.

## Ephemeral state and presenter following

`ViewState` keeps personal preferences separate from `selection` (block/item/floor/view), an optional JSON draft, and a nullable `followOverlay` camera. `createViewState(preferences?)` validates preferences, clears selection/draft, and starts with no presenter overlay. Selection and draft belong to the editing session, not the preference persistence schema; the domain creating the draft remains responsible for its meaning and JSON validity.

`togglePanel(state, panel, visible?)` toggles a panel or explicitly sets its visibility. `selectPreset(state, preset)` changes the primary arrangement. Both return a new state and preserve the exact selection, draft, personal camera, and presenter-overlay references. Neither function accepts or regenerates shared factory intent or a computed plan.

`beginPresenterFollow(state, camera)` is an explicit opt-in operation. It validates and copies the presenter's camera into an ephemeral overlay while preserving personal preferences. Repeated calls update that overlay. `effectiveCamera(state)` reads the overlay when present, otherwise the personal camera. `endPresenterFollow(state)` removes the overlay, restoring presentation of the existing personal camera. Local preference edits made while following remain personal edits and are visible after following ends. A renderer may bind cancellation to Escape or a button; this module installs no handlers and forces no presentation mode.

`preferencesForPersistence(state)` returns a detached validated preference snapshot. Selection, draft, and presenter overlay are excluded. Serializing that snapshot therefore never permanently saves a presenter's camera. Persistence itself is left to a future browser adapter.

## Derived narrow-window presentation

`effectivePresentation(preferences, width)` returns a derived preset and panel visibility without mutating saved preferences. Width must be finite, positive, and at most 65536 logical viewport units. Below 1200, navigation is hidden. Below 900, a saved split preset presents floors instead; an explicit production preset remains production. Inspector and optional graph choices are retained. Returning to a wider window restores the saved arrangement automatically because the original choice was never overwritten.

These are pure presentation decisions, not CSS or rendering implementation. `tests/view-preferences.test.ts` covers schema recovery, independent presets/panels, preserved editing/camera references, strict saved-data boundaries, responsive thresholds, and temporary presenter-camera restoration.
