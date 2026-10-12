import { type BuildVariant } from '../../src/domain/build-variants.js';
import { VariantControl } from './VariantControl.js';
import { SupplyDiagram } from './SupplyDiagram.js';
import { useId, useMemo, useRef, useState } from 'react';
import type { Catalog } from '../../src/domain/catalog.js';
import type { ProductionPlan } from '../../src/domain/production.js';
import type { TechnologyProfile } from '../../src/domain/technology.js';
import { generateSupplyLayout } from '../../src/domain/supply-layout.js';
import { itemName } from '../../src/domain/vanilla.js';
import { MachineGlyph } from './MachineGlyph.js';

export function FloorView({
  catalog,
  plan,
  technology,
  selected,
  zoom,
  rows,
  variant,
  changeVariant,
  machine = 1,
  selectMachine,
  motion = false,
  compact = false,
}: {
  catalog: Catalog;
  plan: ProductionPlan;
  technology: TechnologyProfile;
  selected: string;
  zoom: number;
  rows: number;
  variant: BuildVariant;
  changeVariant: (variant: BuildVariant) => void;
  machine?: number;
  selectMachine?: (id: number) => void;
  motion?: boolean;
  compact?: boolean;
}) {
  const layout = useMemo(
    () => generateSupplyLayout(catalog, plan, technology, rows, variant),
    [catalog, plan, technology, rows, variant],
  );
  const floor =
    layout.floors.find((f) => f.itemId === selected) ?? layout.floors[0]!;
  const marker = useId().replace(/:/g, '');
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
  const feeds = floor.inputs.length;
  // Fit the selected schematic's visible block and every spanning transfer.
  // Shared floor coordinates remain unchanged; empty floor margin is not content.
  const transfers = layout.transfers.filter((t) =>
    t.span.includes(floor.index),
  );
  const sceneLeft = Math.min(8, ...transfers.map((t) => t.x + 1));
  const sceneTop = Math.min(11, ...transfers.map((t) => t.y + 1));
  const sceneWidth =
    Math.max(17 + floor.width + 9, ...transfers.map((t) => t.x + 9)) -
    sceneLeft;
  const sceneHeight =
    Math.max(17 + floor.depth + 6, ...transfers.map((t) => t.y + 9)) - sceneTop;
  const scale = zoom * camera.scale;
  const viewWidth = sceneWidth / scale;
  const viewHeight = sceneHeight / scale;
  const viewX = sceneLeft + (sceneWidth - viewWidth) / 2 + camera.x;
  const viewY = sceneTop + (sceneHeight - viewHeight) / 2 + camera.y;
  return (
    <section className="floor-panel" aria-label="Etagenansicht">
      <div className="canvas-heading">
        <h2>{itemName(floor.machineId)}</h2>
        <VariantControl
          variant={variant}
          itemId={floor.itemId}
          index={floor.index}
          onChange={changeVariant}
        />
      </div>
      <div className="floor-canvas-tools">
        <button
          type="button"
          onClick={() => setCamera({ x: 0, y: 0, scale: 1 / zoom })}
          aria-label="Schema einpassen"
        >
          Einpassen
        </button>
        <button
          type="button"
          aria-label="Verkleinern"
          onClick={() =>
            setCamera((c) => ({
              ...c,
              scale: Math.max(0.4, c.scale / (compact ? 1.5 : 1.2)),
            }))
          }
        >
          −
        </button>
        <button
          type="button"
          aria-label="Vergrößern"
          onClick={() =>
            setCamera((c) => ({
              ...c,
              scale: Math.min(4, c.scale * (compact ? 1.5 : 1.2)),
            }))
          }
        >
          +
        </button>
      </div>
      <div className="drawing">
        <svg
          className={`floor-scene${motion ? ' flow-motion' : ''}`}
          data-testid="floor-scene"
          data-floor-index={floor.index}
          data-input-side={floor.inputSide}
          data-output-side={floor.outputSide}
          viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
          role="group"
          aria-label={`Blockschema ${itemName(floor.itemId)}`}
          style={{ width: '100%', touchAction: 'none', overflow: 'hidden' }}
          onWheel={(event) => {
            setCamera((c) => ({
              ...c,
              scale: Math.max(
                0.4,
                Math.min(4, c.scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1)),
              ),
            }));
          }}
          onPointerDown={(event) => {
            if ((event.target as Element).closest('[data-machine-id]')) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              cameraX: camera.x,
              cameraY: camera.y,
            };
          }}
          onPointerMove={(event) => {
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
            drag.current = null;
          }}
        >
          <defs>
            {['in', 'out'].map((kind) => (
              <marker
                key={kind}
                id={`${marker}-${kind}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path
                  d="M0 1L9 5L0 9Z"
                  fill={kind === 'in' ? '#65b9e5' : '#eea15d'}
                />
              </marker>
            ))}
          </defs>
          <SupplyDiagram layout={layout} floor={floor} marker={marker} />
          {machines.map((m) => (
            <g
              key={m.id}
              className={`machine-button${machine === m.id ? ' selected' : ''}`}
              data-machine-id={m.id}
              role="button"
              tabIndex={0}
              aria-label={`${itemName(floor.machineId)} ${m.id}`}
              aria-pressed={machine === m.id}
              onFocus={() => {
                const left = m.x - 2;
                const right = m.x + 10;
                const upper = m.y - 2;
                const lower = m.y + 8;
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
              <svg
                x={m.x - 1}
                y={m.y - 1}
                width="10"
                height="8"
                viewBox="0 0 100 80"
              >
                <MachineGlyph
                  machineId={floor.machineId}
                  feeds={Math.min(4, feeds)}
                  selected={machine === m.id}
                  number={m.id}
                />
              </svg>
            </g>
          ))}
        </svg>
      </div>
      <div className="canvas-summary">
        <strong>{itemName(floor.itemId)}</strong>
        <span>
          {plan.nodes.find((n) => n.itemId === floor.itemId)!.rate} / min
        </span>
        <span>
          {floor.machines.length} Maschinen · {floor.rowCounts.join(' + ')}
        </span>
      </div>
    </section>
  );
}
