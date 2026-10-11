import { z } from 'zod';

export type ViewPreset = 'floors' | 'production' | 'split';
export type PanelName = 'navigation' | 'inspector' | 'graph';
export interface ViewPanels {
  navigation: boolean;
  inspector: boolean;
  graph: boolean;
}
export interface ViewCamera {
  zoom: number;
  origin: { x: number; y: number };
}
export interface ViewPreferences {
  schemaVersion: 1;
  preset: ViewPreset;
  panels: ViewPanels;
  camera: ViewCamera;
}
export interface ViewPreferenceChange {
  preset?: ViewPreset;
  panels?: Partial<ViewPanels>;
  camera?: { zoom?: number; origin?: { x?: number; y?: number } };
}
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export interface ViewSelection {
  blockId: string | null;
  itemId: string | null;
  floor: number | null;
  view: 'floors' | 'production' | null;
}
export interface ViewState {
  preferences: ViewPreferences;
  selection: ViewSelection;
  draft: { [key: string]: JsonValue } | null;
  followOverlay: ViewCamera | null;
}
export interface ViewPresentation {
  preset: ViewPreset;
  panels: ViewPanels;
}

export const defaultViewPreferences: Readonly<ViewPreferences> = Object.freeze({
  schemaVersion: 1,
  preset: 'floors',
  panels: Object.freeze({ navigation: true, inspector: true, graph: false }),
  camera: Object.freeze({ zoom: 1, origin: Object.freeze({ x: 0, y: 0 }) }),
});

const presetSchema = z.enum(['floors', 'production', 'split']);
const panelSchema = z.enum(['navigation', 'inspector', 'graph']);
const coordinateSchema = z
  .number()
  .finite()
  .min(-1_000_000_000)
  .max(1_000_000_000);
const originSchema = z
  .object({ x: coordinateSchema, y: coordinateSchema })
  .strict();
const cameraSchema = z
  .object({ zoom: z.number().finite().min(0.05).max(20), origin: originSchema })
  .strict();
const panelsSchema = z
  .object({
    navigation: z.boolean(),
    inspector: z.boolean(),
    graph: z.boolean(),
  })
  .strict();
const preferencesSchema = z
  .object({
    schemaVersion: z.literal(1),
    preset: presetSchema,
    panels: panelsSchema,
    camera: cameraSchema,
  })
  .strict();
const changeSchema = z
  .object({
    preset: presetSchema.optional(),
    panels: panelsSchema.partial().optional(),
    camera: cameraSchema
      .extend({ origin: originSchema.partial() })
      .partial()
      .optional(),
  })
  .strict();

/** Accept decoded JSON with exactly the personal preference fields. */
export function validateViewPreferences(value: unknown): ViewPreferences {
  return preferencesSchema.parse(value);
}

/** Unsupported versions and malformed saved data restore a fresh safe default. */
export function restorePreferences(value: unknown): ViewPreferences {
  const restored = preferencesSchema.safeParse(value);
  return restored.success
    ? restored.data
    : validateViewPreferences(defaultViewPreferences);
}

export function updateViewPreferences(
  current: ViewPreferences,
  change: ViewPreferenceChange,
): ViewPreferences {
  validateViewPreferences(current);
  const parsed = changeSchema.parse(change);
  const updated: ViewPreferences = {
    schemaVersion: 1,
    preset: parsed.preset ?? current.preset,
    panels:
      parsed.panels === undefined
        ? current.panels
        : {
            navigation: parsed.panels.navigation ?? current.panels.navigation,
            inspector: parsed.panels.inspector ?? current.panels.inspector,
            graph: parsed.panels.graph ?? current.panels.graph,
          },
    camera:
      parsed.camera === undefined
        ? current.camera
        : {
            zoom: parsed.camera.zoom ?? current.camera.zoom,
            origin:
              parsed.camera.origin === undefined
                ? current.camera.origin
                : {
                    x: parsed.camera.origin.x ?? current.camera.origin.x,
                    y: parsed.camera.origin.y ?? current.camera.origin.y,
                  },
          },
  };
  return updated;
}

export function createViewState(
  preferences: ViewPreferences = defaultViewPreferences,
): ViewState {
  return {
    preferences: validateViewPreferences(preferences),
    selection: { blockId: null, itemId: null, floor: null, view: null },
    draft: null,
    followOverlay: null,
  };
}

export function togglePanel(
  state: ViewState,
  panel: PanelName,
  visible?: boolean,
): ViewState {
  const name = panelSchema.parse(panel);
  const value =
    visible === undefined
      ? !state.preferences.panels[name]
      : z.boolean().parse(visible);
  return {
    ...state,
    preferences: updateViewPreferences(state.preferences, {
      panels: { [name]: value },
    }),
  };
}

export function selectPreset(state: ViewState, preset: ViewPreset): ViewState {
  return {
    ...state,
    preferences: updateViewPreferences(state.preferences, { preset }),
  };
}

/** Presenter cameras are an opt-in ephemeral overlay; personal preferences stay intact. */
export function beginPresenterFollow(
  state: ViewState,
  camera: ViewCamera,
): ViewState {
  return { ...state, followOverlay: cameraSchema.parse(camera) };
}

export function endPresenterFollow(state: ViewState): ViewState {
  return { ...state, followOverlay: null };
}

export function effectiveCamera(state: ViewState): ViewCamera {
  return state.followOverlay ?? state.preferences.camera;
}

/** A detached preference snapshot; no selection, draft, or follow overlay crosses this boundary. */
export function preferencesForPersistence(state: ViewState): ViewPreferences {
  return validateViewPreferences(state.preferences);
}

/** Responsive presentation changes never rewrite the person's saved arrangement. */
export function effectivePresentation(
  preferences: ViewPreferences,
  width: number,
): ViewPresentation {
  validateViewPreferences(preferences);
  z.number().finite().positive().max(65_536).parse(width);
  return {
    preset:
      width < 900 && preferences.preset === 'split'
        ? 'floors'
        : preferences.preset,
    panels: {
      navigation: width >= 1200 && preferences.panels.navigation,
      inspector: preferences.panels.inspector,
      graph: preferences.panels.graph,
    },
  };
}
