import { useEffect, useRef, useState } from 'react';
import { syntheticCatalog } from '../../src/domain/catalog.js';
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
  convertDiscovery,
  type DiscoveryConversion,
} from '../../src/discovery.js';
import { initialProduction, displayName, defaultChoices } from './model';
import { FloorView } from './FloorView';
import { Graph } from './Graph';

const firstInput = initialProduction(syntheticCatalog, {});
const KEY = 'satispire.personal-view.v1';
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Daten konnten nicht verarbeitet werden.';

export function Workspace() {
  const [factory, setFactory] = useState(() => ({
    catalog: syntheticCatalog,
    input: firstInput,
    plan: solveProduction(syntheticCatalog, firstInput),
    details: {} as DiscoveryConversion['details'],
    excluded: [] as DiscoveryConversion['excluded'],
  }));
  const [target, setTarget] = useState(firstInput.targets[0]!.itemId);
  const [rate, setRate] = useState('20');
  const [choices, setChoices] = useState(firstInput.recipes);
  const [selected, setSelected] = useState(firstInput.targets[0]!.itemId);
  const [preferences, setPreferences] = useState(() =>
    restorePreferences(defaultViewPreferences),
  );
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [motion, setMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const [rows, setRows] = useState(2);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const presentation = effectivePresentation(preferences, viewportWidth);
  const importSequence = useRef(0);
  useEffect(() => {
    try {
      setPreferences(
        restorePreferences(JSON.parse(localStorage.getItem(KEY) ?? 'null')),
      );
    } catch {
      /* safe defaults */
    }
    const onResize = () =>
      setViewportWidth(Math.min(65536, Math.max(1, window.innerWidth)));
    onResize();
    window.addEventListener('resize', onResize);
    setPreferencesLoaded(true);
    const onVisibility = () => setVisible(!document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  useEffect(() => {
    if (preferencesLoaded) {
      try {
        localStorage.setItem(KEY, JSON.stringify(preferences));
      } catch {
        /* local planning remains usable */
      }
    }
  }, [preferences, preferencesLoaded]);

  function commitPlan(input: ProductionInput) {
    try {
      const plan = solveProduction(factory.catalog, input);
      setFactory((current) => ({ ...current, input, plan }));
      if (!plan.nodes.some((node) => node.itemId === selected))
        setSelected(plan.nodes[0]?.itemId ?? '');
      setError('');
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  async function importDiscovery(files: File[]) {
    const sequence = ++importSequence.current;
    setPending(true);
    try {
      const required = ['manifest', 'items', 'recipes', 'buildings'];
      if (
        files.length !== 4 ||
        required.some(
          (name) =>
            files.filter((file) => file.name === name + '.json').length !== 1,
        )
      )
        throw new Error(
          'Bitte manifest.json, items.json, recipes.json und buildings.json gemeinsam auswählen.',
        );
      if (
        files.some((file) => file.size > 8_000_000) ||
        files.reduce((sum, file) => sum + file.size, 0) > 24_000_000
      )
        throw new Error(
          'Discovery-Import überschreitet das lokale Größenlimit.',
        );
      const bundle = Object.fromEntries(
        await Promise.all(
          files.map(async (file) => [
            file.name.slice(0, -5),
            JSON.parse(await file.text()) as unknown,
          ]),
        ),
      );
      const converted = convertDiscovery(bundle);
      const input = initialProduction(converted.catalog, converted.details);
      const plan = solveProduction(converted.catalog, input);
      if (sequence !== importSequence.current) return;
      setFactory({
        catalog: converted.catalog,
        input,
        plan,
        details: converted.details,
        excluded: converted.excluded,
      });
      setTarget(input.targets[0]!.itemId);
      setRate(input.targets[0]!.rate);
      setChoices(input.recipes);
      setSelected(input.targets[0]!.itemId);
      setError('');
    } catch (failure) {
      if (sequence === importSequence.current) setError(errorMessage(failure));
    } finally {
      if (sequence === importSequence.current) setPending(false);
    }
  }
  async function importPlan(file: File) {
    const sequence = ++importSequence.current;
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
        document.catalogVersion !== factory.catalog.catalogVersion ||
        !('production' in document)
      )
        throw new Error(
          'Planversion oder Katalog passt nicht zum aktiven lokalen Import.',
        );
      const input = productionSchema.parse(document.production);
      solveProduction(factory.catalog, input);
      if (sequence !== importSequence.current) return;
      commitPlan(input);
      setTarget(input.targets[0]!.itemId);
      setRate(input.targets[0]!.rate);
      setChoices({
        ...defaultChoices(factory.catalog, factory.details),
        ...input.recipes,
      });
    } catch (failure) {
      if (sequence === importSequence.current) setError(errorMessage(failure));
    } finally {
      if (sequence === importSequence.current) setPending(false);
    }
  }
  function exportPlan() {
    const content = {
      schemaVersion: 1,
      catalogVersion: factory.catalog.catalogVersion,
      production: factory.input,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(content, null, 2)], {
        type: 'application/json',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'satispire-plan.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const stage =
    factory.plan.nodes.find((node) => node.itemId === selected) ??
    factory.plan.nodes[0];
  const game = factory.catalog.provenance.kind !== 'synthetic';
  const detail = stage ? factory.details[stage.recipeId] : undefined;
  const panel = (name: 'navigation' | 'graph' | 'inspector') =>
    setPreferences((current) =>
      updateViewPreferences(current, {
        panels: { [name]: !current.panels[name] },
      }),
    );
  const select = (id: string) => setSelected(id);
  const manufactured = factory.catalog.items.filter(
    (item) =>
      !item.raw &&
      factory.catalog.recipes.some((recipe) =>
        recipe.outputs.some((output) => output.itemId === item.id),
      ),
  );
  const showGraph = presentation.panels.graph;
  const showFloors = presentation.preset !== 'production';
  return (
    <main
      className="workspace"
      data-ready={preferencesLoaded ? 'true' : 'false'}
    >
      <fieldset
        className="workspace hydration-boundary"
        disabled={!preferencesLoaded}
      >
        <header className="app-header">
          <h1>Satispire</h1>
          <span className="project-name">Meine Fabrik</span>
          <span className="session-status">Lokale Sitzung</span>
          <button onClick={exportPlan}>Plan exportieren</button>
        </header>
        <nav className="toolbar" aria-label="Persönliche Ansicht">
          <label>
            Ansicht{' '}
            <select
              value={preferences.preset}
              onChange={(event) =>
                setPreferences((current) =>
                  updateViewPreferences(current, {
                    preset: event.target.value as ViewPreset,
                  }),
                )
              }
            >
              <option value="floors">Etagen</option>
              <option value="production">Produktion</option>
              <option value="split">Verknüpft</option>
            </select>
          </label>
          <button
            aria-pressed={presentation.panels.navigation}
            disabled={viewportWidth < 1200}
            title={
              viewportWidth < 1200
                ? 'Navigation auf schmalen Ansichten eingeklappt; Stufenauswahl bleibt verfügbar.'
                : undefined
            }
            onClick={() => panel('navigation')}
          >
            Navigation
          </button>
          <button
            aria-pressed={preferences.panels.graph}
            onClick={() => panel('graph')}
          >
            Graph
          </button>
          <button
            aria-pressed={preferences.panels.inspector}
            onClick={() => panel('inspector')}
          >
            Inspector
          </button>
          <label className="motion-control">
            <input
              type="checkbox"
              checked={motion}
              onChange={(event) => setMotion(event.target.checked)}
            />
            Flussindikatoren
          </label>
        </nav>
        <div className="data-bar">
          <span className="data-kind">
            {game ? 'Lokaler Spielimport' : 'Synthetisches Beispiel'}
          </span>
          <span>
            {game
              ? factory.catalog.provenance.manifest?.gameVersion +
                ' · CL ' +
                factory.catalog.provenance.manifest?.build
              : 'Keine Spieldaten'}
          </span>
          <label className="file-control">
            Discovery importieren
            <input
              type="file"
              multiple
              accept=".json"
              aria-label="Discovery-Dateien"
              disabled={pending}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                if (files.length) void importDiscovery(files);
              }}
            />
          </label>
          <label className="file-control">
            Plan importieren
            <input
              type="file"
              accept=".json"
              aria-label="Plan-Datei"
              disabled={pending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importPlan(file);
              }}
            />
          </label>
        </div>
        <form
          className="planning-controls"
          onSubmit={(event) => {
            event.preventDefault();
            commitPlan({
              targets: [
                { itemId: target, rate },
                ...factory.input.targets.slice(1),
              ],
              recipes: choices,
              imports: factory.input.imports,
            });
          }}
        >
          <label>
            Produktionsziel
            <select
              aria-label="Produktionsziel"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              disabled={pending}
            >
              {manufactured.map((item) => (
                <option key={item.id} value={item.id}>
                  {displayName(item.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Zielrate pro Minute
            <input
              aria-label="Zielrate pro Minute"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              inputMode="decimal"
              disabled={pending}
            />
          </label>
          <button className="primary" type="submit" disabled={pending}>
            {pending ? 'Import wird geprüft' : 'Plan berechnen'}
          </button>
          <span className="muted">
            Rezepte bei 100 % · kein Energie- oder Weltmodifiermodell
          </span>
        </form>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <span>Der letzte gültige Plan bleibt erhalten.</span>
          </div>
        )}
        <div className="workspace-body">
          {presentation.panels.navigation && (
            <aside className="navigation-panel" aria-label="Stufennavigation">
              <h2>Produktionsstufen</h2>
              {factory.plan.nodes.map((node, index) => (
                <button
                  key={node.itemId}
                  className={
                    'stage-navigation ' +
                    (selected === node.itemId ? 'selected' : '')
                  }
                  aria-pressed={selected === node.itemId}
                  onClick={() => select(node.itemId)}
                >
                  <span>
                    {index + 1}. {displayName(node.itemId)}
                  </span>
                  <strong>{node.rate} / min</strong>
                  <small>{node.machineCount} Maschinen</small>
                </button>
              ))}
              <h2>Rohstoffimporte</h2>
              <ul className="imports">
                {factory.plan.imports.map((item) => (
                  <li key={item.itemId}>
                    <span>{displayName(item.itemId)}</span>
                    <strong>{item.rate} / min</strong>
                  </li>
                ))}
              </ul>
              <p className="muted">
                Raten und Auswahl bleiben beim Ansichtswechsel unverändert.
              </p>
            </aside>
          )}
          <div className="center-workspace">
            <div className="accessible-stages">
              <label>
                Stufe auswählen
                <select
                  aria-label="Stufe auswählen"
                  value={selected}
                  onChange={(event) => select(event.target.value)}
                >
                  {factory.plan.nodes.map((node) => (
                    <option key={node.itemId} value={node.itemId}>
                      {displayName(node.itemId)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="views">
              {!showGraph && !showFloors && (
                <p role="status">
                  Graph ausgeblendet. Über den Graph-Schalter wieder einblenden.
                </p>
              )}
              {showGraph && (
                <Graph
                  catalog={factory.catalog}
                  plan={factory.plan}
                  selected={selected}
                  select={select}
                  motion={motion && visible}
                />
              )}
              {showFloors && (
                <FloorView
                  catalog={factory.catalog}
                  input={factory.input}
                  plan={factory.plan}
                  selected={selected}
                  zoom={preferences.camera.zoom}
                  rows={rows}
                />
              )}
            </div>
            <div className="canvas-toolbar">
              <label>
                Zoom
                <select
                  value={preferences.camera.zoom}
                  onChange={(event) =>
                    setPreferences((current) =>
                      updateViewPreferences(current, {
                        camera: { zoom: Number(event.target.value) },
                      }),
                    )
                  }
                >
                  <option value={0.5}>50 %</option>
                  <option value={1}>100 %</option>
                  <option value={1.25}>125 %</option>
                </select>
              </label>
              {!game && (
                <label>
                  Reihen
                  <select
                    value={rows}
                    onChange={(event) => setRows(Number(event.target.value))}
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                  </select>
                </label>
              )}
              <span className="muted">
                {game
                  ? 'Keine verifizierte Gebäudegeometrie'
                  : 'Ein Ursprung und Grundriss für alle Etagen'}
              </span>
            </div>
          </div>
          {presentation.panels.inspector && stage && (
            <aside className="inspector-panel" aria-label="Stufeninspector">
              <h2>{displayName(stage.itemId)}</h2>
              <p className="muted">{displayName(stage.machineId)}</p>
              <dl>
                <dt>Produktionsrate</dt>
                <dd>{stage.rate} / min</dd>
                <dt>Aufgestellt</dt>
                <dd>{stage.machineCount}</dd>
                <dt>Auslastung</dt>
                <dd>{stage.utilization}</dd>
                <dt>Taktmodell</dt>
                <dd>100 %</dd>
                <dt>Energie / Shards</dt>
                <dd>Unbekannt</dd>
              </dl>
              <label>
                Rezept für diese Stufe
                <select
                  aria-label="Rezept für diese Stufe"
                  value={choices[stage.itemId] ?? stage.recipeId}
                  onChange={(event) =>
                    setChoices((current) => ({
                      ...current,
                      [stage.itemId]: event.target.value,
                    }))
                  }
                >
                  {factory.catalog.recipes
                    .filter((recipe) =>
                      recipe.outputs.some(
                        (output) => output.itemId === stage.itemId,
                      ),
                    )
                    .map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {displayName(recipe.id)}
                        {factory.details[recipe.id]?.alternate
                          ? ' · Alternative'
                          : ''}
                      </option>
                    ))}
                </select>
              </label>
              <p className="muted">
                Rezeptänderung mit „Plan berechnen“ prüfen und übernehmen.
              </p>
              {game && (
                <div className="geometry-warning">
                  <h3>Geometrie noch offen</h3>
                  <p>
                    Keine geprüften Maschinenports, keine Kollisions- oder
                    Bauprüfung.
                  </p>
                  <p>
                    {detail?.alternate ? 'Alternativrezept' : 'Standardrezept'}{' '}
                    ·{' '}
                    {detail?.eventRestricted
                      ? 'Eventgebunden'
                      : 'Kein exportiertes Eventfeld'}
                  </p>
                  <p>
                    {detail?.unlockIds.length ?? 0} verknüpfte Freischaltungen;
                    nicht als aktueller Spielstand verifiziert.
                  </p>
                </div>
              )}
              {game && (
                <details>
                  <summary>
                    {factory.excluded.length} dokumentierte Ausschlüsse
                  </summary>
                  <ul className="diagnostics">
                    {factory.excluded.map((entry, i) => (
                      <li key={i}>
                        {entry.id}: {entry.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </aside>
          )}
        </div>
        <footer>
          Importierte Daten bleiben in diesem Browser. Kein Upload und keine
          Online-Zusammenarbeit eingerichtet.
        </footer>
      </fieldset>
    </main>
  );
}
