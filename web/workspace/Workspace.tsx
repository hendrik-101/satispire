import { useEffect, useMemo, useRef, useState } from 'react';
import {
  solveProduction,
  type ProductionInput,
} from '../../src/domain/production.js';
import { productionSchema } from '../../src/inputs.js';
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
const initialView = {
  ...defaultViewPreferences,
  panels: { navigation: false, graph: false, inspector: false },
};
const KEY = 'satispire.personal-view.v2';
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Plan konnte nicht verarbeitet werden.';
export function Workspace() {
  const [factory, setFactory] = useState(() => ({
    input: firstInput,
    plan: solveProduction(catalog, firstInput),
    technology: firstTechnology,
    rows: 0,
  }));
  const [target, setTarget] = useState(firstInput.targets[0]!.itemId);
  const [rate, setRate] = useState('20');
  const [choices, setChoices] = useState(firstInput.recipes);
  const [selected, setSelected] = useState(target);
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
  const [search, setSearch] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const sequence = useRef(0);
  const presentation = effectivePresentation(preferences, width);
  useEffect(() => {
    const room = createRoom({
      roomId: 'local',
      ownerId: 'workspace-owner',
      ownerName: 'Owner',
    });
    const app = createLocalApplication(
      room,
      { roomId: room.id, participantId: 'workspace-owner' },
      catalog,
    );
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
    };
  }, []);
  useEffect(() => {
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
    () => availableRecipes(factory.technology),
    [factory.technology],
  );
  const manufactured = useMemo(() => {
    const defaults = availableChoices(
      factory.technology,
      factory.input.imports,
    );
    return catalog.items.filter((item) => {
      if (item.raw || !defaults[item.id]) return false;
      try {
        solveProduction(catalog, {
          targets: [{ itemId: item.id, rate: '1' }],
          recipes: defaults,
          imports: factory.input.imports,
          technology: factory.technology,
        });
        return true;
      } catch {
        return false;
      }
    });
  }, [factory.technology, factory.input.imports]);
  function evaluate(
    input: ProductionInput,
    technology: TechnologyProfile,
    rows = factory.rows,
  ) {
    const resolved = { ...input, technology };
    const plan = solveProduction(catalog, resolved);
    generateSupplyLayout(catalog, plan, technology, rows);
    return { input: resolved, plan, technology, rows };
  }
  function apply(
    input: ProductionInput,
    technology = factory.technology,
    rows = factory.rows,
  ) {
    sequence.current++;
    setPending(false);
    const next = evaluate(input, technology, rows);
    setFactory(next);
    setError('');
    if (!next.plan.nodes.some((n) => n.itemId === selected))
      setSelected(next.plan.nodes[0]?.itemId ?? '');
    return next;
  }
  function calculate() {
    sequence.current++;
    setPending(false);
    try {
      apply({
        ...factory.input,
        targets: [
          { itemId: target, rate },
          ...factory.input.targets.slice(1).filter((t) => t.itemId !== target),
        ],
        recipes: choices,
      });
    } catch (e) {
      setError(message(e));
    }
  }
  async function importPlan(file: File) {
    const id = ++sequence.current;
    setPending(true);
    try {
      if (file.size > 1_000_000)
        throw new Error('Plan überschreitet das Größenlimit.');
      const document: unknown = JSON.parse(await file.text());
      if (
        !document ||
        typeof document !== 'object' ||
        !('schemaVersion' in document) ||
        document.schemaVersion !== 1 ||
        !('catalogVersion' in document) ||
        document.catalogVersion !== catalog.catalogVersion ||
        !('production' in document)
      )
        throw new Error('Plan- oder Katalogversion passt nicht.');
      const input = productionSchema.parse(document.production);
      const technology = input.technology ?? factory.technology;
      const next = evaluate(input, technology);
      if (id !== sequence.current) return;
      setFactory(next);
      setTarget(input.targets[0]!.itemId);
      setRate(input.targets[0]!.rate);
      setChoices({
        ...availableChoices(technology, input.imports),
        ...input.recipes,
      });
      setSelected(next.plan.nodes[0]?.itemId ?? '');
      setError('');
    } catch (e) {
      if (id === sequence.current) setError(message(e));
    } finally {
      if (id === sequence.current) setPending(false);
    }
  }
  function exportPlan() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              schemaVersion: 1,
              catalogVersion: catalog.catalogVersion,
              production: factory.input,
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
  function openProfile() {
    setProfileDraft(structuredClone(factory.technology));
    setSearch('');
    setTier('custom');
    setProfileOpen(true);
  }
  function closeProfile() {
    dialog.current?.close();
    setProfileOpen(false);
  }
  function applyProfile() {
    try {
      const allowed = new Set(availableRecipes(profileDraft).map((r) => r.id));
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
  return (
    <main className="workspace" data-ready={ready ? 'true' : 'false'}>
      <fieldset className="workspace hydration-boundary" disabled={!ready}>
        <header className="app-header">
          <h1>Satispire</h1>
          <span className="project-name">Meine Fabrik</span>
          <span className="catalog-version" title={catalog.catalogVersion}>
            Vanilla 1.0
          </span>
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
            >
              <Icon name="export" />
            </button>
          </div>
        </header>
        <form
          className="planning-controls"
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
          <label className="sr-only" htmlFor="rate">
            Zielrate pro Minute
          </label>
          <input
            id="rate"
            aria-label="Zielrate pro Minute"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            disabled={pending}
          />
          <span className="rate-unit">/ min</span>
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
        {error && !profileOpen && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <div className="workspace-body">
          {presentation.panels.navigation && (
            <aside className="navigation-panel" aria-label="Stufennavigation">
              <h2>Produktion</h2>
              {factory.plan.nodes.map((n, i) => (
                <button
                  key={n.itemId}
                  className={
                    'stage-navigation ' +
                    (selected === n.itemId ? 'selected' : '')
                  }
                  aria-pressed={selected === n.itemId}
                  onClick={() => setSelected(n.itemId)}
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
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {factory.plan.nodes.map((n, i) => (
                    <option key={n.itemId} value={n.itemId}>
                      Etage {i + 1} · {itemName(n.itemId)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reihen
                <select
                  aria-label="Reihen"
                  value={factory.rows}
                  onChange={(e) => {
                    try {
                      apply(
                        factory.input,
                        factory.technology,
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
              <details className="view-options">
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
                  catalog={catalog}
                  plan={factory.plan}
                  technology={factory.technology}
                  selected={selected}
                  zoom={preferences.camera.zoom}
                  rows={factory.rows}
                />
              )}
              {presentation.preset !== 'floors' && (
                <ProductionView
                  plan={factory.plan}
                  selected={selected}
                  select={setSelected}
                />
              )}
              {presentation.panels.graph && (
                <Graph
                  catalog={catalog}
                  plan={factory.plan}
                  selected={selected}
                  select={setSelected}
                  motion={motion && visible}
                />
              )}
            </div>
          </div>
          {presentation.panels.inspector && (
            <aside className="inspector-panel" aria-label="Stufeninspector">
              <h2>{itemName(stage.itemId)}</h2>
              <p className="muted">{itemName(stage.machineId)}</p>
              <dl>
                <dt>Rate</dt>
                <dd>{stage.rate} / min</dd>
                <dt>Maschinen</dt>
                <dd>{stage.machineCount}</dd>
                <dt>Auslastung</dt>
                <dd>{stage.utilization}</dd>
                <dt>Maße / Ports</dt>
                <dd>Unbekannt</dd>
              </dl>
              <label>
                Rezept für diese Stufe
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
            <button className="primary" onClick={applyProfile}>
              Profil anwenden
            </button>
          </div>
        </dialog>
      )}
    </main>
  );
}
