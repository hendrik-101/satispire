import type {
  SessionPresence,
  SessionPresenceInput,
} from '../../src/session-plan.js';
import { RemoteCursors } from './RemoteCursors.js';
import { supplySceneBounds, supplySceneMetrics } from './supply-scene.js';
import { type BuildVariant } from '../../src/domain/build-variants.js';
import { VariantControl } from './VariantControl.js';
import { SupplyDiagram } from './SupplyDiagram.js';
import { FoundationGrid } from './FoundationGrid.js';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Catalog } from '../../src/domain/catalog.js';
import type { ProductionPlan } from '../../src/domain/production.js';
import type { TechnologyProfile } from '../../src/domain/technology.js';
import { generateSupplyLayout } from '../../src/domain/supply-layout.js';
import { localizedName as itemName } from './labels.js';
import { MachineGlyph } from './MachineGlyph.js';
import { resourcePalette } from './resource-colors.js';
import { formatPercent, formatRate } from './format-rate.js';
import { Rational } from '../../src/domain/rational.js';

export function FloorView({
  catalog,
  plan,
  technology,
  selected,
  zoom,
  onZoomChange,
  rows,
  variant,
  changeVariant,
  machine = 1,
  selectMachine,
  motion = false,
  compact = false,
  showBeltRates = false,
  peers = [],
  onPresence,
}: {
  catalog: Catalog;
  plan: ProductionPlan;
  technology: TechnologyProfile;
  selected: string;
  zoom: number;
  onZoomChange?: (zoom: number) => void;
  rows: number;
  variant: BuildVariant;
  changeVariant: (variant: BuildVariant) => void;
  machine?: number;
  selectMachine?: (id: number) => void;
  motion?: boolean;
  compact?: boolean;
  showBeltRates?: boolean;
  peers?: SessionPresence[];
  onPresence?: (cursor: SessionPresenceInput['cursor']) => void;
}) {
  const layout = useMemo(
    () => generateSupplyLayout(catalog, plan, technology, rows, variant),
    [catalog, plan, technology, rows, variant],
  );
  const floor =
    layout.floors.find((f) => f.itemId === selected) ?? layout.floors[0]!;
  const stage = plan.nodes.find((node) => node.itemId === floor.itemId)!;
  const marker = useId().replace(/:/g, '');
  const sceneRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setViewport({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(scene);
    return () => observer.disconnect();
  }, []);
  const [camera, setCamera] = useState({
    x: 0,
    y: 0,
    scale: 1,
  });
  const drag = useRef<{
    x: number;
    y: number;
    cameraX: number;
    cameraY: number;
  } | null>(null);
  const machines = floor.machines.map((m) => ({
    ...m,
    x: m.x + 17,
    y: m.y + 17,
  }));
  // Scene geometry depends on the factory, never on the selected floor.
  const scenes = useMemo(
    () =>
      layout.floors.map((entry) =>
        supplySceneBounds(layout, entry, catalog, technology, compact),
      ),
    [layout, catalog, technology, compact],
  );
  const scene = useMemo(
    () => supplySceneMetrics(layout, floor, catalog, technology, compact),
    [layout, floor, catalog, technology, compact],
  );
  const feeds = scene.feeds;
  const sceneLeft = Math.min(...scenes.map((entry) => entry.sceneLeft));
  const sceneTop = Math.min(...scenes.map((entry) => entry.sceneTop));
  const sceneWidth =
    Math.max(...scenes.map((entry) => entry.sceneLeft + entry.sceneWidth)) -
    sceneLeft;
  const sceneHeight =
    Math.max(...scenes.map((entry) => entry.sceneTop + entry.sceneHeight)) -
    sceneTop;
  const machineRate = (rate: string, itemId: string) =>
    `${formatRate(
      Rational.parseCanonical(rate)
        .divide(Rational.parse(String(stage.machineCount)))
        .toString(),
    )} ${catalog.items.find((item) => item.id === itemId)?.transport === 'pipe' ? 'm³/min' : 'Stk./min'}`;
  const machineDescription = `${itemName(floor.machineId)} · Takt ${formatPercent(stage.utilization)} · EIN: ${stage.inputs.map((input) => `${itemName(input.itemId)} ${machineRate(input.rate, input.itemId)}`).join(', ')} · AUS: ${itemName(stage.itemId)} ${machineRate(stage.rate, stage.itemId)}`;
  const scale = onZoomChange ? zoom : zoom * camera.scale;
  const changeZoom = (factor: number) => {
    if (onZoomChange) onZoomChange(Math.max(0.05, Math.min(20, zoom * factor)));
    else
      setCamera((current) => ({
        ...current,
        scale: Math.max(0.4, Math.min(4, current.scale * factor)),
      }));
  };
  const aspect =
    viewport.width && viewport.height
      ? viewport.width / viewport.height
      : sceneWidth / sceneHeight;
  const fittedWidth = Math.max(sceneWidth, sceneHeight * aspect);
  const fittedHeight = Math.max(sceneHeight, sceneWidth / aspect);
  const viewWidth = fittedWidth / scale;
  const viewHeight = fittedHeight / scale;
  const viewX = sceneLeft + (sceneWidth - viewWidth) / 2 + camera.x;
  const viewY = sceneTop + (sceneHeight - viewHeight) / 2 + camera.y;
  return (
    <section className="floor-panel" aria-label="Etagenansicht">
      <div className="canvas-heading">
        <h2>{itemName(floor.machineId)}</h2>
        <VariantControl
          variant={variant}
          itemId={floor.itemId}
          inputSide={floor.inputSide}
          outputSide={floor.outputSide}
          onChange={changeVariant}
        />
      </div>
      <div className="floor-canvas-tools">
        <button
          type="button"
          onClick={() => {
            setCamera({ x: 0, y: 0, scale: onZoomChange ? 1 : 1 / zoom });
            onZoomChange?.(1);
          }}
          aria-label="Schema einpassen"
        >
          Einpassen
        </button>
        <button
          type="button"
          aria-label="Verkleinern"
          onClick={() => changeZoom(1 / (compact ? 1.5 : 1.2))}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Vergrößern"
          onClick={() => changeZoom(compact ? 1.5 : 1.2)}
        >
          +
        </button>
        <output
          aria-label="Aktueller Zoom"
          data-canvas-zoom={Math.round(scale * 100)}
        >
          {Math.round(scale * 100)} %
        </output>
      </div>
      <div className="drawing">
        <svg
          ref={sceneRef}
          className={`floor-scene${motion ? ' flow-motion' : ''}`}
          data-testid="floor-scene"
          data-floor-index={floor.index}
          data-input-side={floor.inputSide}
          data-output-side={floor.outputSide}
          viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
          role="group"
          aria-label={`Blockschema ${itemName(floor.itemId)}`}
          style={{ width: '100%', touchAction: 'none', overflow: 'hidden' }}
          onWheel={(event) => changeZoom(event.deltaY < 0 ? 1.1 : 1 / 1.1)}
          onPointerDown={(event) => {
            if (
              (event.target as Element).closest(
                '[data-machine-id], [data-belt-id]',
              )
            )
              return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              cameraX: camera.x,
              cameraY: camera.y,
            };
          }}
          onPointerLeave={() => onPresence?.(null)}
          onPointerMove={(event) => {
            if (onPresence) {
              const matrix = event.currentTarget.getScreenCTM();
              if (matrix) {
                const point = event.currentTarget.createSVGPoint();
                point.x = event.clientX;
                point.y = event.clientY;
                const world = point.matrixTransform(matrix.inverse());
                onPresence({ x: world.x, y: world.y });
              }
            }
            const start = drag.current;
            if (!start) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const unit = Math.max(
              viewWidth / rect.width,
              viewHeight / rect.height,
            );
            setCamera((c) => ({
              ...c,
              x: start.cameraX - (event.clientX - start.x) * unit,
              y: start.cameraY - (event.clientY - start.y) * unit,
            }));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            onPresence?.(null);
            drag.current = null;
          }}
        >
          <defs>
            {resourcePalette.map((color) => (
              <marker
                key={color}
                id={`${marker}-${color.slice(1)}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path d="M0 1L9 5L0 9Z" fill={color} />
              </marker>
            ))}
          </defs>
          <FoundationGrid
            id={marker}
            x={viewX}
            y={viewY}
            width={viewWidth}
            height={viewHeight}
            pixelsPerUnit={Math.min(
              viewport.width / viewWidth,
              viewport.height / viewHeight,
            )}
          />
          <SupplyDiagram
            key={floor.itemId}
            scene={scene}
            layout={layout}
            floor={floor}
            marker={marker}
            catalog={catalog}
            technology={technology}
            compact={compact}
            showBeltRates={showBeltRates}
          />
          {machines.map((m) => (
            <g
              key={m.id}
              className={`machine-button${machine === m.id ? ' selected' : ''}`}
              data-machine-id={m.id}
              role="button"
              tabIndex={0}
              aria-label={`${itemName(floor.machineId)} ${m.id}`}
              aria-pressed={machine === m.id}
              aria-describedby={`${marker}-machine-${m.id}`}
              onFocus={() => {
                const left = m.x - 2;
                const right = m.x + m.width + 2;
                const upper = m.y - 2;
                const lower = m.y + m.depth + 2;
                const dx =
                  left < viewX
                    ? left - viewX
                    : right > viewX + viewWidth
                      ? right - viewX - viewWidth
                      : 0;
                const dy =
                  upper < viewY
                    ? upper - viewY
                    : lower > viewY + viewHeight
                      ? lower - viewY - viewHeight
                      : 0;
                if (dx || dy)
                  setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
              }}
              onClick={() => selectMachine?.(m.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectMachine?.(m.id);
                }
              }}
            >
              <title>{`${itemName(floor.machineId)} ${m.id} · ${machineDescription}`}</title>
              <desc id={`${marker}-machine-${m.id}`}>{machineDescription}</desc>
              <svg
                x={m.x}
                y={m.y}
                width={m.width}
                height={m.depth}
                viewBox="0 0 80 100"
              >
                <MachineGlyph
                  machineId={floor.machineId}
                  feeds={Math.min(4, feeds)}
                  inputItems={floor.inputs.map((input) => input.itemId)}
                  outputItem={floor.itemId}
                  selected={machine === m.id}
                  number={m.id}
                />
              </svg>
            </g>
          ))}
          <RemoteCursors peers={peers} svg />
        </svg>
      </div>
      <div className="canvas-summary">
        <strong>{itemName(floor.itemId)}</strong>
        <span>{formatRate(stage.rate)} / min</span>
        <span>
          {floor.machines.length}{' '}
          {floor.machines.length === 1 ? 'Maschine' : 'Maschinen'} ·{' '}
          {floor.rowCounts.join(' + ')} · je {formatPercent(stage.utilization)}{' '}
          Takt
        </span>
      </div>
      <div
        className="canvas-grid-key"
        title="Farbe = Rohstoff · Pfeile = Flussrichtung"
      >
        Fundament 8 × 8 m · Raster 0,5 m{' '}
        <span>
          {itemName(floor.machineId)} = Maschinensymbol · EIN = Eingang · AUS =
          Ausgang
        </span>
        <span>
          Farbe = Material · Pfeil = Flussrichtung · Schacht = Etagenverbindung
        </span>
        <span>Symbole nicht maßstäblich · Bandlasten: Stk./min</span>
      </div>
    </section>
  );
}
