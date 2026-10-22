import {
  defaultBuildVariant,
  type BuildVariant,
} from '../../src/domain/build-variants.js';
import { planFileSchema } from '../../src/plan-file.js';
import {
  createUnlockProfile,
  validateUnlockProfile,
  MAX_HUB_TIER_BY_PHASE,
  type UnlockProfile,
} from '../../src/domain/session-unlocks.js';
import { loadUnlockProfile, saveUnlockProfile } from './unlock-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  solveProduction,
  type ProductionInput,
} from '../../src/domain/production.js';
import {
  defaultViewPreferences,
  effectivePresentation,
  restorePreferences,
  updateViewPreferences,
  type ViewPreset,
} from '../../src/domain/view-preferences.js';
import {
  vanillaCatalog,
  technologyAtTier,
  availableChoices,
  availableRecipes,
  itemName,
  recipeUnlocks,
} from '../../src/domain/vanilla.js';
import { generateSupplyLayout } from '../../src/domain/supply-layout.js';
import {
  supplyLines,
  type TechnologyProfile,
} from '../../src/domain/technology.js';
import { FloorView } from './FloorView';
import { Graph } from './Graph';
import { Icon } from './Icon';
import { ProductionView } from './ProductionView';
import { MachineGlyph } from './MachineGlyph';
import { SourceCredits } from './SourceCredits';
import { calculateProduction } from './model';
import { createLocalApplication } from '../../src/application.js';
import { createRoom } from '../../src/domain/rooms.js';
import {
  registerWebMcp,
  type ModelContext,
} from '../../src/adapters/webmcp.js';

const catalog = vanillaCatalog;
const firstTechnology = technologyAtTier(2);
const firstInput: ProductionInput = {
  targets: [{ itemId: 'Desc_IronPlate_C', rate: '20' }],
  recipes: availableChoices(firstTechnology),
  imports: catalog.items.filter((i) => i.raw).map((i) => i.id),
  technology: firstTechnology,
};
function primaryStage(
  input: ProductionInput,
  plan: ReturnType<typeof solveProduction>,
) {
  return (
    input.targets.find((t) => plan.nodes.some((n) => n.itemId === t.itemId))
      ?.itemId ?? plan.nodes[0]!.itemId
  );
}
function feasibleRecipes(technology: TechnologyProfile, imports: string[]) {
  const defaults = availableChoices(technology, imports);
  return availableRecipes(technology).filter((recipe) => {
    try {
      solveProduction(catalog, {
        targets: [{ itemId: recipe.outputs[0]!.itemId, rate: '1' }],
        recipes: { ...defaults, [recipe.outputs[0]!.itemId]: recipe.id },
        imports: imports,
        technology: technology,
      });
      return true;
    } catch {
      return false;
    }
  });
}
const initialView = {
  ...defaultViewPreferences,
  panels: { navigation: false, graph: false, inspector: false },
};
const KEY = 'satispire.personal-view.v2';
const roomContext = { roomId: 'local', participantId: 'workspace-owner' };
// Access is deferred so browsers which block even the storage getter remain usable.
const sessionUnlockStorage = {
  getItem: (key: string) => window.sessionStorage.getItem(key),
  setItem: (key: string, value: string) =>
    window.sessionStorage.setItem(key, value),
};
const browserUnlockStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) =>
    window.localStorage.setItem(key, value),
};
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Plan konnte nicht verarbeitet werden.';
export function Workspace() {
  const [sessionProfile, setSessionProfile] = useState(createUnlockProfile);
  const sessionRoom = useRef(
    createRoom({
      roomId: roomContext.roomId,
      ownerId: roomContext.participantId,
      ownerName: 'Owner',
      unlocks: createUnlockProfile(),
    }),
  );
  const application = useRef<ReturnType<typeof createLocalApplication> | null>(
    null,
  );
  const [storageNotice, setStorageNotice] = useState('');
  const [factory, setFactory] = useState(() => ({
    input: firstInput,
    plan: solveProduction(catalog, firstInput),
    technology: firstTechnology,
    rows: 0,
    variant: defaultBuildVariant,
  }));
  const [target, setTarget] = useState(firstInput.targets[0]!.itemId);
  const [rate, setRate] = useState('20');
  const [sizingMode, setSizingMode] = useState<'target' | 'input'>('target');
  const [inputItem, setInputItem] = useState('');
  const [inputRate, setInputRate] = useState('180');
  const [choices, setChoices] = useState(firstInput.recipes);
  const [selected, setSelected] = useState(target);
  const [selectedMachine, setSelectedMachine] = useState(1);
  function selectStage(itemId: string) {
    setSelected(itemId);
    setSelectedMachine(1);
  }
  const [preferences, setPreferences] = useState(() =>
    restorePreferences(initialView),
  );
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(1200);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [motion, setMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const [profileDraft, setProfileDraft] = useState(firstTechnology);
  const [tier, setTier] = useState<number | 'custom'>(2);
  const [phase, setPhase] = useState(0);
  const [search, setSearch] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const sequence = useRef(0);
  const profileRevision = useRef(0);
  const planMatchesSession =
    JSON.stringify(factory.technology) ===
    JSON.stringify(sessionProfile.technology);
  const presentation = effectivePresentation(preferences, width);
  useEffect(() => {
    if (!ready) return;
    const room = sessionRoom.current;
    const app = createLocalApplication(
      room,
      { roomId: room.id, participantId: 'workspace-owner' },
      catalog,
      (next) => {
        sessionRoom.current = next;
        if (next.unlocks) setSessionProfile(next.unlocks);
      },
    );
    application.current = app;
    const register = () =>
      registerWebMcp(
        document as Document & { modelContext?: ModelContext },
        app.execute,
      );
    let handle = register();
    const dispose = () => {
      try {
        handle.dispose();
      } catch {
        // The adapter deactivates callbacks before cleanup; unmount retries pending removals.
      }
    };
    const resume = (event: PageTransitionEvent) => {
      if (event.persisted) {
        dispose();
        handle = register();
      }
    };
    window.addEventListener('pagehide', dispose);
    window.addEventListener('pageshow', resume);
    return () => {
      window.removeEventListener('pagehide', dispose);
      window.removeEventListener('pageshow', resume);
      dispose();
      application.current = null;
    };
  }, [ready]);
  useEffect(() => {
    const restored = loadUnlockProfile(
      sessionUnlockStorage,
      browserUnlockStorage,
      roomContext,
    );
    sessionRoom.current = createRoom({
      roomId: roomContext.roomId,
      ownerId: roomContext.participantId,
      ownerName: 'Owner',
      unlocks: restored,
    });
    setSessionProfile(restored);
    try {
      const recipes = availableChoices(restored.technology, firstInput.imports);
      const itemId = recipes[firstInput.targets[0]!.itemId]
        ? firstInput.targets[0]!.itemId
        : Object.keys(recipes)[0];
      if (!itemId)
        throw new Error('Keine berechenbaren Produktionsziele freigeschaltet.');
      const input = {
        ...firstInput,
        recipes,
        technology: restored.technology,
        targets: [{ itemId, rate: '20' }],
      };
      const next = evaluate(input, restored.technology, 0, defaultBuildVariant);
      setFactory(next);
      setTarget(itemId);
      setChoices(recipes);
      selectStage(primaryStage(input, next.plan));
    } catch (e) {
      setError('Gespeicherte Session-Unlocks: ' + message(e));
    }
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) setPreferences(restorePreferences(JSON.parse(saved)));
    } catch {
      /* safe local defaults */
    }
    const resize = () =>
      setWidth(Math.max(1, Math.min(65536, window.innerWidth)));
    const visibility = () => setVisible(!document.hidden);
    resize();
    visibility();
    setReady(true);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      sequence.current++;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const saved = saveUnlockProfile(
      sessionUnlockStorage,
      browserUnlockStorage,
      roomContext,
      sessionProfile,
    );
    setStorageNotice(
      saved.session && saved.browser
        ? ''
        : 'Browser-Speicherung eingeschränkt. Die Unlocks gelten weiterhin für die laufende Session.',
    );
    if (
      JSON.stringify(sessionProfile.technology) ===
      JSON.stringify(factory.technology)
    )
      return;
    sequence.current++;
    setPending(false);
    try {
      const allowed = new Set(
        feasibleRecipes(sessionProfile.technology, factory.input.imports).map(
          (r) => r.id,
        ),
      );
      const recipes = {
        ...availableChoices(sessionProfile.technology, factory.input.imports),
        ...Object.fromEntries(
          Object.entries(factory.input.recipes).filter(([, id]) =>
            allowed.has(id),
          ),
        ),
      };
      const next = evaluate(
        { ...factory.input, recipes },
        sessionProfile.technology,
      );
      setFactory(next);
      setChoices(recipes);
      setError('');
    } catch (e) {
      const defaults = availableChoices(
        sessionProfile.technology,
        factory.input.imports,
      );
      setChoices(defaults);
      if (!defaults[target] && Object.keys(defaults)[0])
        setTarget(Object.keys(defaults)[0]!);
      setError(
        'Session-Unlocks geändert. Der bisherige Plan ist damit nicht berechenbar: ' +
          message(e),
      );
    }
  }, [ready, sessionProfile]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(KEY, JSON.stringify(preferences));
      } catch {
        /* storage optional */
      }
  }, [ready, preferences]);
  useEffect(() => {
    if (profileOpen) dialog.current?.showModal();
  }, [profileOpen]);
  const candidates = useMemo(
    () => feasibleRecipes(sessionProfile.technology, factory.input.imports),
    [sessionProfile.technology, factory.input.imports],
  );
  const manufactured = useMemo(() => {
    const defaults = availableChoices(
      sessionProfile.technology,
      factory.input.imports,
    );
    return catalog.items.filter((item) => {
      if (item.raw || !defaults[item.id]) return false;
      try {
        solveProduction(catalog, {
          targets: [{ itemId: item.id, rate: '1' }],
          recipes: defaults,
          imports: factory.input.imports,
          technology: sessionProfile.technology,
        });
        return true;
      } catch {
        return false;
      }
    });
  }, [sessionProfile.technology, factory.input.imports]);
  const sizingInputs = useMemo(() => {
    try {
      return calculateProduction(
        catalog,
        {
          ...factory.input,
          recipes: choices,
          technology: sessionProfile.technology,
        },
        { itemId: target, rate: '1' },
      ).plan.imports;
    } catch {
      return [];
    }
  }, [factory.input, choices, target, sessionProfile.technology]);
  const sizingInput =
    sizingInputs.find((entry) => entry.itemId === inputItem)?.itemId ??
    sizingInputs[0]?.itemId ??
    '';
  const supplyLayout = useMemo(
    () =>
      generateSupplyLayout(
        catalog,
        factory.plan,
        factory.technology,
        factory.rows,
        factory.variant,
      ),
    [factory],
  );
  function evaluate(
    input: ProductionInput,
    technology: TechnologyProfile,
    rows = factory.rows,
    variant: BuildVariant = factory.variant,
    pruneOverrides = true,
  ) {
    const resolved = { ...input, technology };
    const plan = solveProduction(catalog, resolved);
    const normalized = pruneOverrides
      ? {
          ...variant,
          overrides: variant.overrides.filter((o) =>
            plan.nodes.some((n) => n.itemId === o.itemId),
          ),
        }
      : variant;
    generateSupplyLayout(catalog, plan, technology, rows, normalized);
    return { input: resolved, plan, technology, rows, variant: normalized };
  }
  function apply(
    input: ProductionInput,
    technology = sessionProfile.technology,
    rows = factory.rows,
    variant: BuildVariant = factory.variant,
  ) {
    sequence.current++;
    setPending(false);
    const next = evaluate(input, technology, rows, variant);
    setFactory(next);
    setError('');
    if (!next.plan.nodes.some((n) => n.itemId === selected))
      selectStage(primaryStage(next.input, next.plan));
    return next;
  }
  function calculate() {
    sequence.current++;
    setPending(false);
    try {
      const result = calculateProduction(
        catalog,
        {
          ...factory.input,
          recipes: choices,
          technology: sessionProfile.technology,
        },
        {
          itemId: target,
          rate:
            sizingMode === 'target'
              ? rate
              : factory.input.targets[0]!.itemId === target
                ? factory.input.targets[0]!.rate
                : '1',
        },
        sizingMode === 'input'
          ? { itemId: sizingInput, rate: inputRate }
          : undefined,
      );
      const next = apply(result.input);
      setRate(next.input.targets[0]!.rate);
    } catch (e) {
      setError(message(e));
    }
  }
  async function updateSessionProfile(
    profile: UnlockProfile,
    expectedRevision = sessionRoom.current.revision,
  ) {
    const app = application.current;
    if (!app) throw new Error('Session ist noch nicht bereit.');
    const result = await app.execute('apply_command', {
      roomId: roomContext.roomId,
      command: {
        id: crypto.randomUUID(),
        expectedRevision,
        command: { type: 'set-unlocks', profile },
      },
    });
    if (!result.ok)
      throw new Error(
        result.error?.code === 'revision-conflict'
          ? 'Die Session wurde inzwischen geändert. Bitte öffne die Einstellungen erneut.'
          : (result.error?.message ??
            'Session-Unlocks konnten nicht gespeichert werden.'),
      );
  }
  async function importPlan(file: File) {
    const id = ++sequence.current;
    const expectedRevision = sessionRoom.current.revision;
    setPending(true);
    try {
      if (file.size > 1_000_000)
        throw new Error('Plan überschreitet das Größenlimit.');
      const document = planFileSchema.parse(JSON.parse(await file.text()));
      if (document.catalogVersion !== catalog.catalogVersion)
        throw new Error(
          `Plan- oder Katalogversion passt nicht. Erwartet wird die Datenbasis für Satisfactory ${catalog.provenance.manifest!.gameVersion}.`,
        );
      const input = document.production;
      const technology =
        input.technology ??
        document.unlocks?.technology ??
        sessionProfile.technology;
      const importedProfile =
        document.unlocks ??
        validateUnlockProfile({ ...sessionProfile, hubTier: null, technology });
      if (
        JSON.stringify(importedProfile.technology) !==
        JSON.stringify(technology)
      )
        throw new Error('Plan und Session-Unlocks passen nicht zusammen.');
      const next = evaluate(
        input,
        technology,
        document.layout.rows,
        document.layout.variant,
        false,
      );
      if (id !== sequence.current) return;
      await updateSessionProfile(importedProfile, expectedRevision);
      setFactory(next);
      setTarget(input.targets[0]!.itemId);
      setRate(input.targets[0]!.rate);
      setSizingMode('target');
      setInputItem('');
      setChoices({
        ...availableChoices(technology, input.imports),
        // Only reachable overrides were validated by the solver during import.
        ...Object.fromEntries(
          next.plan.nodes.map((node) => [node.itemId, node.recipeId]),
        ),
      });
      selectStage(primaryStage(input, next.plan));
      setError('');
    } catch (e) {
      if (id === sequence.current) setError(message(e));
    } finally {
      if (id === sequence.current) setPending(false);
    }
  }
  function exportPlan() {
    if (!planMatchesSession) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              schemaVersion: 1,
              catalogVersion: catalog.catalogVersion,
              unlocks: sessionProfile,
              production: factory.input,
              layout: { rows: factory.rows, variant: factory.variant },
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'satispire-plan.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const panel = (name: 'navigation' | 'graph' | 'inspector') =>
    setPreferences((p) =>
      updateViewPreferences(p, { panels: { [name]: !p.panels[name] } }),
    );
  const stage =
    factory.plan.nodes.find((n) => n.itemId === selected) ??
    factory.plan.nodes[0]!;
  const machineGeometry = supplyLayout.floors.find(
    (floor) => floor.itemId === stage.itemId,
  )!.machineGeometry;
  function openProfile() {
    profileRevision.current = sessionRoom.current.revision;
    setProfileDraft(structuredClone(sessionProfile.technology));
    setSearch('');
    setTier(sessionProfile.hubTier ?? 'custom');
    setPhase(sessionProfile.spaceElevatorPhase);
    setError('');
    setProfileOpen(true);
  }
  function closeProfile() {
    dialog.current?.close();
    setProfileOpen(false);
  }
  async function applyProfile() {
    try {
      const allowed = new Set(
        feasibleRecipes(profileDraft, factory.input.imports).map((r) => r.id),
      );
      const active = new Set(factory.plan.nodes.map((node) => node.itemId));
      const previousDefaults = availableChoices(
        factory.technology,
        factory.input.imports,
      );
      const recipes = {
        ...availableChoices(profileDraft, factory.input.imports),
        ...Object.fromEntries(
          Object.entries(factory.input.recipes).filter(
            ([itemId, id]) => active.has(itemId) && allowed.has(id),
          ),
        ),
      };
      const profile = validateUnlockProfile({
        ...sessionProfile,
        technology: profileDraft,
        hubTier: tier === 'custom' ? null : tier,
        spaceElevatorPhase: phase,
      });
      evaluate({ ...factory.input, recipes }, profileDraft);
      await updateSessionProfile(profile, profileRevision.current);
      apply({ ...factory.input, recipes }, profileDraft);
      setChoices({
        ...recipes,
        ...Object.fromEntries(
          Object.entries(choices).filter(
            ([itemId, id]) =>
              allowed.has(id) &&
              (id !==
                (factory.input.recipes[itemId] ?? previousDefaults[itemId]) ||
                id !== previousDefaults[itemId]),
          ),
        ),
      });
      closeProfile();
    } catch (e) {
      setError(message(e));
    }
  }
  function toggleProfile(
    field: 'availableMachines' | 'unlockedRecipes',
    id: string,
    checked: boolean,
  ) {
    setTier('custom');
    setProfileDraft((p) => ({
      ...p,
      [field]: checked
        ? [...new Set([...p[field], id])]
        : p[field].filter((v) => v !== id),
    }));
  }
  const cameraControls = (
    <>
      <label>
        Reihen
        <select
          aria-label="Reihen"
          value={factory.rows}
          onChange={(e) => {
            try {
              apply(
                factory.input,
                sessionProfile.technology,
                Number(e.target.value),
              );
            } catch (err) {
              setError(message(err));
            }
          }}
        >
          <option value="0">Auto</option>
          {[1, 2, 3, 4, 6, 8].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label>
        Zoom
        <select
          aria-label="Zoom"
          value={preferences.camera.zoom}
          onChange={(e) =>
            setPreferences((p) =>
              updateViewPreferences(p, {
                camera: { zoom: Number(e.target.value) },
              }),
            )
          }
        >
          <option value="0.5">50 %</option>
          <option value="1">100 %</option>
          <option value="1.25">125 %</option>
        </select>
      </label>
    </>
  );
  return (
    <main className="workspace" data-ready={ready ? 'true' : 'false'}>
      <fieldset className="workspace hydration-boundary" disabled={!ready}>
        <header className="app-header">
          <h1>Satispire</h1>
          <span className="project-name">Meine Fabrik</span>
          <span className="catalog-version" title={catalog.catalogVersion}>
            Vanilla {catalog.provenance.manifest!.gameVersion}
          </span>
          <form
            className="planning-controls"
            data-sizing-mode={sizingMode}
            onSubmit={(e) => {
              e.preventDefault();
              calculate();
            }}
          >
            <label className="sr-only" htmlFor="target">
              Produktionsziel
            </label>
            <select
              id="target"
              aria-label="Produktionsziel"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={pending}
            >
              {manufactured.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="sizing-mode">
              Berechnungsmodus
            </label>
            <select
              id="sizing-mode"
              className="sizing-mode"
              value={sizingMode}
              onChange={(e) =>
                setSizingMode(e.target.value as 'target' | 'input')
              }
              disabled={pending}
            >
              <option value="target">Nach Zielmenge</option>
              <option value="input">Nach Input</option>
            </select>
            <div className="rate-controls">
              {sizingMode === 'input' && (
                <>
                  <label className="sr-only" htmlFor="input-item">
                    Verfügbarer Input
                  </label>
                  <select
                    id="input-item"
                    value={sizingInput}
                    onChange={(e) => setInputItem(e.target.value)}
                    disabled={pending || sizingInputs.length === 0}
                  >
                    {sizingInputs.length === 0 && (
                      <option value="">Kein externer Input</option>
                    )}
                    {sizingInputs.map((entry) => (
                      <option key={entry.itemId} value={entry.itemId}>
                        {itemName(entry.itemId)}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <label className="sr-only" htmlFor="rate">
                {sizingMode === 'target'
                  ? 'Zielrate pro Minute'
                  : 'Inputrate pro Minute'}
              </label>
              <input
                id="rate"
                value={sizingMode === 'target' ? rate : inputRate}
                onChange={(e) =>
                  sizingMode === 'target'
                    ? setRate(e.target.value)
                    : setInputRate(e.target.value)
                }
                title="Dezimalzahl oder Bruch, z. B. 7,5 oder 15/2"
                inputMode="decimal"
                disabled={pending}
              />
              <span className="rate-unit">/ min</span>
            </div>
            <button className="primary" type="submit" disabled={pending}>
              Plan berechnen
            </button>
            <button
              type="button"
              className="technology-button"
              onClick={openProfile}
            >
              <Icon name="technology" />
              Technologie
            </button>
          </form>
          <div className="header-actions">
            {(['navigation', 'graph', 'inspector'] as const).map((name) => (
              <button
                key={name}
                className="icon-button"
                aria-label={
                  name === 'navigation'
                    ? 'Navigation'
                    : name === 'graph'
                      ? 'Graph'
                      : 'Inspector'
                }
                title={
                  name === 'navigation'
                    ? 'Navigation'
                    : name === 'graph'
                      ? 'Graph'
                      : 'Inspector'
                }
                aria-pressed={presentation.panels[name]}
                disabled={name === 'navigation' && width < 1200}
                onClick={() => panel(name)}
              >
                <Icon name={name} />
              </button>
            ))}
            <label
              className="file-control icon-button"
              title="Plan importieren"
            >
              <Icon name="import" />
              <span className="sr-only">Plan importieren</span>
              <input
                type="file"
                accept=".json"
                aria-label="Plan-Datei"
                disabled={pending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void importPlan(file);
                }}
              />
            </label>
            <button
              className="icon-button"
              aria-label="Plan exportieren"
              title="Plan exportieren"
              onClick={exportPlan}
              disabled={!planMatchesSession}
            >
              <Icon name="export" />
            </button>
          </div>
        </header>

        {error && !profileOpen && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {storageNotice && (
          <div role="status" className="error-banner">
            {storageNotice}
          </div>
        )}
        {!planMatchesSession && !profileOpen && (
          <div role="status" className="error-banner">
            Der angezeigte Plan verwendet frühere Session-Unlocks. Wähle ein
            freigeschaltetes Ziel und berechne ihn erneut.
          </div>
        )}
        <div className="workspace-body">
          {presentation.panels.navigation && (
            <aside className="navigation-panel" aria-label="Stufennavigation">
              <h2>Produktion</h2>
              {supplyLayout.floors.map((n, i) => (
                <button
                  key={n.itemId}
                  className={
                    'stage-navigation ' +
                    (selected === n.itemId ? 'selected' : '')
                  }
                  aria-pressed={selected === n.itemId}
                  onClick={() => selectStage(n.itemId)}
                >
                  <span>
                    {i + 1}. {itemName(n.itemId)}
                  </span>
                  <strong>{n.rate} / min</strong>
                  <small>
                    {n.machineCount} × {itemName(n.machineId)}
                  </small>
                </button>
              ))}
              <h2>Rohstoffe</h2>
              <ul className="imports">
                {factory.plan.imports.map((i) => (
                  <li key={i.itemId}>
                    <span>{itemName(i.itemId)}</span>
                    <strong>{i.rate} / min</strong>
                  </li>
                ))}
              </ul>
            </aside>
          )}
          <div className="center-workspace">
            <div className="canvas-toolbar">
              <label>
                <span className="sr-only">Stufe auswählen</span>
                <select
                  aria-label="Stufe auswählen"
                  value={selected}
                  onChange={(e) => selectStage(e.target.value)}
                >
                  {supplyLayout.floors.map((n, i) => (
                    <option key={n.itemId} value={n.itemId}>
                      Etage {i + 1} · {itemName(n.itemId)}
                    </option>
                  ))}
                </select>
              </label>
              {width > 640 && cameraControls}
              <details
                className="view-options"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.currentTarget.open = false;
                    event.currentTarget.querySelector('summary')?.focus();
                  }
                }}
              >
                <summary>Ansicht</summary>
                <label>
                  Ansicht
                  <select
                    value={preferences.preset}
                    onChange={(e) =>
                      setPreferences((p) =>
                        updateViewPreferences(p, {
                          preset: e.target.value as ViewPreset,
                        }),
                      )
                    }
                  >
                    <option value="floors">Etagen</option>
                    <option value="production">Produktion</option>
                    <option value="split">Verknüpft</option>
                  </select>
                </label>
                {width <= 640 && cameraControls}
                <label>
                  <input
                    type="checkbox"
                    aria-label="Flussindikatoren"
                    checked={motion}
                    onChange={(e) => setMotion(e.target.checked)}
                  />{' '}
                  Flussindikatoren
                </label>
              </details>
            </div>
            <div className={'views preset-' + presentation.preset}>
              {presentation.preset !== 'production' && (
                <FloorView
                  key={`${selected}:${factory.rows}:${stage.machineCount}`}
                  catalog={catalog}
                  plan={factory.plan}
                  technology={factory.technology}
                  selected={selected}
                  zoom={preferences.camera.zoom}
                  rows={factory.rows}
                  variant={factory.variant}
                  changeVariant={(variant) => {
                    try {
                      apply(
                        factory.input,
                        sessionProfile.technology,
                        factory.rows,
                        variant,
                      );
                    } catch (e) {
                      setError(message(e));
                    }
                  }}
                  machine={Math.min(selectedMachine, stage.machineCount)}
                  selectMachine={setSelectedMachine}
                  motion={motion && visible}
                  compact={width <= 640}
                />
              )}
              {presentation.preset !== 'floors' && (
                <ProductionView
                  plan={factory.plan}
                  selected={selected}
                  select={selectStage}
                />
              )}
              {presentation.panels.graph && (
                <Graph
                  catalog={catalog}
                  plan={factory.plan}
                  selected={selected}
                  select={selectStage}
                  motion={motion && visible}
                />
              )}
            </div>
          </div>
          {presentation.panels.inspector && (
            <aside className="inspector-panel" aria-label="Stufeninspector">
              <div className="inspector-identity">
                <svg viewBox="0 0 100 80" aria-hidden="true">
                  <MachineGlyph
                    machineId={stage.machineId}
                    feeds={stage.inputs.length}
                    selected
                  />
                </svg>
                <div>
                  <h2>{itemName(stage.itemId)}</h2>
                  <span className="machine-identity">
                    {itemName(stage.machineId)}{' '}
                    {Math.min(selectedMachine, stage.machineCount)}
                  </span>
                </div>
              </div>
              <dl>
                <dt>Stufenrate</dt>
                <dd>{stage.rate} / min</dd>
                <dt>Maschinen</dt>
                <dd>{stage.machineCount}</dd>
                <dt>Auslastung</dt>
                <dd>{stage.utilization}</dd>
              </dl>
              {machineGeometry &&
                [
                  { label: 'Maschinenmaße', size: machineGeometry.bounds.size },
                  {
                    label: 'Baufreiraum',
                    size: machineGeometry.clearance.size,
                  },
                ].map(({ label, size }) => (
                  <section key={label}>
                    <h3>{label}</h3>
                    <dl role="group" aria-label={label}>
                      <dt>Breite</dt>
                      <dd>{size.width.toLocaleString('de-DE')} m</dd>
                      <dt>Tiefe</dt>
                      <dd>{size.depth.toLocaleString('de-DE')} m</dd>
                      <dt>Höhe</dt>
                      <dd>{size.height.toLocaleString('de-DE')} m</dd>
                    </dl>
                  </section>
                ))}
              <label>
                Rezept
                <select
                  aria-label="Rezept für diese Stufe"
                  value={choices[stage.itemId] ?? stage.recipeId}
                  onChange={(e) =>
                    setChoices((c) => ({
                      ...c,
                      [stage.itemId]: e.target.value,
                    }))
                  }
                >
                  {candidates
                    .filter((r) => r.outputs[0]!.itemId === stage.itemId)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>
              <h3>Versorgung</h3>
              <ul className="imports">
                {[
                  ...stage.inputs,
                  { itemId: stage.itemId, rate: stage.rate },
                ].map((i) => (
                  <li key={i.itemId}>
                    <span>{itemName(i.itemId)}</span>
                    <strong>
                      {i.rate} / min ·{' '}
                      {supplyLines(
                        catalog,
                        i.itemId,
                        i.rate,
                        factory.technology,
                      )}{' '}
                      {catalog.items.find((it) => it.id === i.itemId)!
                        .transport === 'pipe'
                        ? 'Pipes'
                        : 'Belts'}
                    </strong>
                  </li>
                ))}
              </ul>
              <SourceCredits />
            </aside>
          )}
        </div>
      </fieldset>
      {profileOpen && (
        <dialog
          ref={dialog}
          className="technology-dialog"
          aria-label="Technologieprofil"
          onCancel={(e) => {
            e.preventDefault();
            closeProfile();
          }}
        >
          <div className="dialog-heading">
            <h2>Technologieprofil</h2>
            <button aria-label="Schließen" onClick={closeProfile}>
              ×
            </button>
          </div>
          <div className="profile-controls">
            <label>
              HUB-Tier
              <select
                aria-label="HUB-Tier"
                value={tier}
                onChange={(e) => {
                  if (e.target.value === 'custom') return;
                  const next = Number(e.target.value);
                  setTier(next);
                  setProfileDraft(technologyAtTier(next));
                  setPhase((current) =>
                    Math.max(
                      current,
                      createUnlockProfile(next).spaceElevatorPhase,
                    ),
                  );
                }}
              >
                <option value="custom">Individuell</option>
                {Array.from({ length: 10 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Space Elevator
              <select
                aria-label="Abgeschlossene Space-Elevator-Phase"
                value={phase}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setPhase(next);
                  const maxTier = MAX_HUB_TIER_BY_PHASE[next]!;
                  if (next < phase && (tier === 'custom' || tier > maxTier)) {
                    setTier(maxTier);
                    setProfileDraft(technologyAtTier(maxTier));
                  }
                }}
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n === 0
                      ? 'Noch keine Phase'
                      : 'Phase ' + n + ' abgeschlossen'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Belts
              <select
                aria-label="Maximales Belt-Tier"
                value={profileDraft.beltTier}
                onChange={(e) => {
                  setTier('custom');
                  setProfileDraft((p) => ({
                    ...p,
                    beltTier: Number(e.target.value),
                  }));
                }}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    Mk.{n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pipes
              <select
                aria-label="Maximales Pipe-Tier"
                value={profileDraft.pipeTier}
                onChange={(e) => {
                  setTier('custom');
                  setProfileDraft((p) => ({
                    ...p,
                    pipeTier: Number(e.target.value),
                  }));
                }}
              >
                <option value="1">Mk.1</option>
                <option value="2">Mk.2</option>
              </select>
            </label>
          </div>
          <p className="profile-help">
            Gilt für die gesamte Session. Alle Teilnehmer können die Unlocks
            ändern. Neue Sessions starten mit deinen zuletzt im Browser
            gespeicherten Einstellungen.
          </p>
          <p className="profile-help">
            HUB-Tiers sind Vorlagen. Eine niedrigere Space-Elevator-Phase
            begrenzt die Vorlage; einzelne Unlocks lassen sich anschließend
            individuell anpassen.
          </p>
          <h3>Maschinen</h3>
          <div className="machine-options">
            {catalog.machines.map((m) => (
              <label key={m.id}>
                <input
                  type="checkbox"
                  aria-label={'Maschine ' + m.name}
                  checked={profileDraft.availableMachines.includes(m.id)}
                  onChange={(e) =>
                    toggleProfile('availableMachines', m.id, e.target.checked)
                  }
                />
                {m.name}
              </label>
            ))}
          </div>
          <h3>Rezeptfreischaltungen</h3>
          <input
            type="search"
            aria-label="Rezepte suchen"
            placeholder="Rezepte suchen"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="recipe-options">
            {catalog.recipes
              .filter((r) =>
                r.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((r) => (
                <label key={r.id}>
                  <input
                    type="checkbox"
                    aria-label={'Rezept ' + r.name}
                    checked={profileDraft.unlockedRecipes.includes(r.id)}
                    onChange={(e) =>
                      toggleProfile('unlockedRecipes', r.id, e.target.checked)
                    }
                  />
                  <span>
                    {r.name}
                    {recipeUnlocks[r.id]!.alternate ? ' · Alt' : ''}
                  </span>
                </label>
              ))}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <div className="dialog-actions">
            <button onClick={closeProfile}>Abbrechen</button>
            <button className="primary" onClick={() => void applyProfile()}>
              Profil anwenden
            </button>
          </div>
        </dialog>
      )}
    </main>
  );
}
