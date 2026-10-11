import { describe, expect, it } from 'vitest';
import {
  beginPresenterFollow,
  createViewState,
  defaultViewPreferences,
  effectiveCamera,
  effectivePresentation,
  endPresenterFollow,
  preferencesForPersistence,
  restorePreferences,
  selectPreset,
  togglePanel,
  updateViewPreferences,
  validateViewPreferences,
  type ViewState,
} from '../src/domain/view-preferences.js';

function selectedState(): ViewState {
  return {
    ...createViewState(),
    selection: {
      blockId: 'block-a',
      itemId: 'item-a',
      floor: 2,
      view: 'floors',
    },
    draft: { rows: 3, proposedTarget: '10/3' },
    preferences: updateViewPreferences(defaultViewPreferences, {
      camera: { zoom: 2.5, origin: { x: 41, y: -12 } },
    }),
  };
}

describe('personal view preferences', () => {
  it('provides schema version one with floors as the default preset', () => {
    expect(defaultViewPreferences).toEqual({
      schemaVersion: 1,
      preset: 'floors',
      panels: { navigation: true, inspector: true, graph: false },
      camera: { zoom: 1, origin: { x: 0, y: 0 } },
    });
    expect(validateViewPreferences(defaultViewPreferences)).toEqual(
      defaultViewPreferences,
    );
  });

  it.each(['navigation', 'inspector', 'graph'] as const)(
    'toggles %s while preserving selection, draft, and personal camera',
    (panel) => {
      const state = selectedState();
      const next = togglePanel(state, panel);
      expect(next.preferences.panels[panel]).toBe(
        !state.preferences.panels[panel],
      );
      expect(next.selection).toBe(state.selection);
      expect(next.draft).toBe(state.draft);
      expect(next.preferences.camera).toBe(state.preferences.camera);
      expect(state.preferences.panels).toEqual(defaultViewPreferences.panels);
      expect(togglePanel(next, panel).preferences).toEqual(state.preferences);
    },
  );

  it('supports an explicit panel state without changing other panels', () => {
    const state = selectedState();
    const next = togglePanel(state, 'graph', true);
    expect(next.preferences.panels).toEqual({
      navigation: true,
      inspector: true,
      graph: true,
    });
    expect(togglePanel(next, 'graph', true).preferences.panels.graph).toBe(
      true,
    );
  });

  it.each(['floors', 'production', 'split'] as const)(
    'selects %s independently of panel choices and editing state',
    (preset) => {
      const state = togglePanel(selectedState(), 'navigation', false);
      const next = selectPreset(state, preset);
      expect(next.preferences.preset).toBe(preset);
      expect(next.preferences.panels).toBe(state.preferences.panels);
      expect(next.selection).toBe(state.selection);
      expect(next.draft).toBe(state.draft);
      expect(next.preferences.camera).toBe(state.preferences.camera);
    },
  );

  it('merges partial camera and panel updates without modifying the input', () => {
    const current = selectedState().preferences;
    const snapshot = JSON.stringify(current);
    const next = updateViewPreferences(current, {
      camera: { zoom: 4, origin: { y: 20 } },
      panels: { inspector: false },
    });
    expect(next.camera).toEqual({ zoom: 4, origin: { x: 41, y: 20 } });
    expect(next.panels).toEqual({
      navigation: true,
      inspector: false,
      graph: false,
    });
    expect(JSON.stringify(current)).toBe(snapshot);
  });

  it('round trips only personal preferences and never persists selection, draft or presenter overlay', () => {
    const state = beginPresenterFollow(selectedState(), {
      zoom: 7,
      origin: { x: 200, y: 300 },
    });
    const saved = preferencesForPersistence(state);
    expect(saved).toEqual(state.preferences);
    expect(Object.keys(saved).sort()).toEqual([
      'camera',
      'panels',
      'preset',
      'schemaVersion',
    ]);
    expect(restorePreferences(JSON.parse(JSON.stringify(saved)))).toEqual(
      state.preferences,
    );
    expect(saved.camera.zoom).toBe(2.5);
  });

  it.each([
    null,
    [],
    'not JSON',
    {},
    { ...defaultViewPreferences, schemaVersion: 2 },
    { ...defaultViewPreferences, preset: 'unknown' },
    {
      ...defaultViewPreferences,
      panels: { navigation: 'yes', inspector: true, graph: false },
    },
    { ...defaultViewPreferences, factory: { targets: { iron: 40 } } },
    {
      ...defaultViewPreferences,
      camera: { zoom: NaN, origin: { x: 0, y: 0 } },
    },
    {
      ...defaultViewPreferences,
      camera: { zoom: 1, origin: { x: Infinity, y: 0 } },
    },
    { ...defaultViewPreferences, camera: { zoom: 0, origin: { x: 0, y: 0 } } },
  ])(
    'rejects corrupted saved values and restores safe defaults: %j',
    (invalid) => {
      expect(() => validateViewPreferences(invalid)).toThrow();
      expect(restorePreferences(invalid)).toEqual(defaultViewPreferences);
    },
  );

  it('returns fresh restore values rather than writable references to defaults', () => {
    const first = restorePreferences(undefined);
    first.camera.zoom = 2;
    first.panels.graph = true;
    expect(restorePreferences(undefined)).toEqual(defaultViewPreferences);
    expect(defaultViewPreferences.camera.zoom).toBe(1);
  });

  it('rejects invalid runtime preference changes and unavailable panels', () => {
    expect(() =>
      updateViewPreferences(defaultViewPreferences, {
        preset: 'unknown',
      } as never),
    ).toThrow();
    expect(() =>
      updateViewPreferences(defaultViewPreferences, { camera: { zoom: -1 } }),
    ).toThrow();
    expect(() =>
      updateViewPreferences(defaultViewPreferences, { factory: {} } as never),
    ).toThrow();
    expect(() => togglePanel(selectedState(), 'unknown' as never)).toThrow();
  });
});

describe('derived small-window presentation', () => {
  it.each([
    [1200, true, 'split'],
    [1199, false, 'split'],
    [900, false, 'split'],
    [899, false, 'floors'],
  ] as const)(
    'derives presentation at %i units without changing the saved choice',
    (width, navigation, preset) => {
      const preferences = updateViewPreferences(defaultViewPreferences, {
        preset: 'split',
        panels: { graph: true },
      });
      const effective = effectivePresentation(preferences, width);
      expect(effective).toEqual({
        preset,
        panels: { navigation, inspector: true, graph: true },
      });
      expect(preferences.preset).toBe('split');
      expect(preferences.panels.navigation).toBe(true);
    },
  );

  it('respects an already hidden navigation panel and an explicit production preset', () => {
    const preferences = updateViewPreferences(defaultViewPreferences, {
      preset: 'production',
      panels: { navigation: false },
    });
    expect(effectivePresentation(preferences, 1600)).toMatchObject({
      preset: 'production',
      panels: { navigation: false },
    });
    expect(effectivePresentation(preferences, 600).preset).toBe('production');
  });

  it.each([0, -1, NaN, Infinity])(
    'rejects an invalid viewport width %s',
    (width) => {
      expect(() =>
        effectivePresentation(defaultViewPreferences, width),
      ).toThrow();
    },
  );
});

describe('temporary presenter camera', () => {
  const presenterCamera = { zoom: 3, origin: { x: 100, y: -80 } };

  it('uses an opt-in overlay and restores the personal camera when follow ends', () => {
    const state = selectedState();
    expect(state.followOverlay).toBeNull();
    expect(effectiveCamera(state)).toBe(state.preferences.camera);
    const following = beginPresenterFollow(state, presenterCamera);
    expect(effectiveCamera(following)).toEqual(presenterCamera);
    expect(following.preferences).toBe(state.preferences);
    expect(following.selection).toBe(state.selection);
    expect(following.draft).toBe(state.draft);
    expect(state.followOverlay).toBeNull();
    const ended = endPresenterFollow(following);
    expect(ended.followOverlay).toBeNull();
    expect(effectiveCamera(ended)).toBe(state.preferences.camera);
    expect(ended.preferences).toBe(state.preferences);
  });

  it('accepts later presenter updates without losing the personal restoration state', () => {
    const state = selectedState();
    const next = beginPresenterFollow(
      beginPresenterFollow(state, presenterCamera),
      { zoom: 5, origin: { x: 1, y: 2 } },
    );
    expect(effectiveCamera(next).zoom).toBe(5);
    expect(effectiveCamera(endPresenterFollow(next))).toEqual(
      state.preferences.camera,
    );
  });

  it('preserves a follow overlay through panel and preset changes', () => {
    const state = beginPresenterFollow(selectedState(), presenterCamera);
    const next = selectPreset(togglePanel(state, 'inspector'), 'split');
    expect(next.followOverlay).toBe(state.followOverlay);
    expect(preferencesForPersistence(next).camera).toEqual(
      state.preferences.camera,
    );
  });

  it('copies incoming camera values and rejects an invalid presenter camera', () => {
    const camera = { zoom: 3, origin: { x: 100, y: -80 } };
    const state = beginPresenterFollow(selectedState(), camera);
    camera.origin.x = 500;
    expect(effectiveCamera(state).origin.x).toBe(100);
    expect(() =>
      beginPresenterFollow(state, { zoom: Infinity, origin: { x: 0, y: 0 } }),
    ).toThrow();
  });
});
