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
  machine?: number;
  selectMachine?: (id: number) => void;
  motion?: boolean;
  compact?: boolean;
}) {
  const layout = useMemo(
    () => generateSupplyLayout(catalog, plan, technology, rows),
    [catalog, plan, technology, rows],
  );
  const floor =
    layout.floors.find((f) => f.itemId === selected) ?? layout.floors[0]!;
  const marker = useId().replace(/:/g, '');
  const [camera, setCamera] = useState({
    x: 0,
    y: 0,
    scale: 1,
    overview: false,
  });
  const drag = useRef<{
    x: number;
    y: number;
    cameraX: number;
    cameraY: number;
  } | null>(null);
  const maxX = Math.max(...floor.machines.map((m) => m.x + m.width));
  const maxY = Math.max(...floor.machines.map((m) => m.y + m.depth));
  const transferX = maxX + 13;
  const inputX = maxX + 3;
  const feeds = Math.max(1, Math.min(4, floor.inputs.length));
  const feedIndices = Array.from({ length: feeds }, (_, i) => i);
  const portX = (x: number, feed: number) =>
    x + 1 + ((feed + 1) * 6) / (feeds + 1);
  const outputX = maxX + 9;
  const sceneWidth = transferX + 12;
  const sceneHeight = maxY + 13;
  const scale = zoom * camera.scale;
  const framedWidth =
    compact && !camera.overview ? Math.min(sceneWidth, 58) : sceneWidth;
  const viewWidth = framedWidth / scale;
  const viewHeight = sceneHeight / scale;
  const viewX =
    (compact && !camera.overview
      ? (framedWidth - viewWidth) / 2
      : (sceneWidth - viewWidth) / 2) + camera.x;
  const viewY = (sceneHeight - viewHeight) / 2 + camera.y;
  const top = floor.machines[0]!.y - 3;
  const bottom = maxY + 3;
  const transferY = (top + bottom) / 2;
  const belt = (d: string, output = false) => (
    <g
      className={`supply-belt ${output ? 'supply-belt-output' : 'supply-belt-input'}`}
    >
      <path
        d={d}
        fill="none"
        stroke={output ? '#897c60' : '#607a83'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        className="supply-belt-edge"
        d={d}
        fill="none"
        stroke="#202a31"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      <path
        d={d}
        fill="none"
        stroke={output ? '#c1ae80' : '#a0bec7'}
        strokeWidth="0.2"
        markerEnd={`url(#${marker}-${output ? 'out' : 'in'})`}
      />
    </g>
  );
  return (
    <section className="floor-panel" aria-label="Etagenansicht">
      <div className="canvas-heading">
        <h2>{itemName(floor.machineId)}</h2>
      </div>
      <div className="floor-canvas-tools">
        <button
          type="button"
          onClick={() =>
            setCamera({ x: 0, y: 0, scale: 1 / zoom, overview: true })
          }
          aria-label="Schema einpassen"
        >
          Einpassen
        </button>
        <button
          type="button"
          aria-label="Verkleinern"
          onClick={() =>
            setCamera((c) => ({ ...c, scale: Math.max(0.4, c.scale / 1.2) }))
          }
        >
          −
        </button>
        <button
          type="button"
          aria-label="Vergrößern"
          onClick={() =>
            setCamera((c) => ({ ...c, scale: Math.min(4, c.scale * 1.2) }))
          }
        >
          +
        </button>
      </div>
      <div className="drawing">
        <svg
          className={`floor-scene${motion ? ' flow-motion' : ''}`}
          data-testid="floor-scene"
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
                  fill={kind === 'in' ? '#a0bec7' : '#c1ae80'}
                />
              </marker>
            ))}
          </defs>
          <rect
            className="block-boundary"
            x="3"
            y="2"
            width={sceneWidth - 6}
            height={sceneHeight - 4}
            rx="1"
            fill="#28303822"
            stroke="#48545e"
            strokeWidth="0.15"
          />
          {feedIndices.map((feed) => (
            <g
              key={feed}
              data-feed={feed + 1}
              aria-label={
                floor.inputs[feed]
                  ? itemName(floor.inputs[feed]!.itemId)
                  : undefined
              }
            >
              {belt(
                `M ${transferX} ${transferY - 1.5 - feed * 0.9} H ${inputX + feed * 1.5} V ${top - feed * 1.6}`,
              )}
              {floor.rowCounts.length > 1 &&
                belt(
                  `M ${inputX + feed * 1.5} ${top - feed * 1.6} V ${top + (floor.rowCounts.length - 1) * 16 - feed * 1.6}`,
                )}
            </g>
          ))}
          {belt(
            `M ${outputX} ${top + 12} V ${bottom} H ${transferX} V ${transferY + 1.5}`,
            true,
          )}
          {floor.rowCounts.map((count, row) => {
            const machines = floor.machines.filter((m) => m.y === 8 + row * 16);
            const first = machines[0]!;
            const inputY = first.y - 3;
            const outputY = first.y + 9;
            return (
              <g key={row}>
                {feedIndices.map((feed) => (
                  <g key={feed}>
                    {belt(
                      `M ${inputX + feed * 1.5} ${inputY - feed * 1.6} H ${portX(first.x, feed)}`,
                    )}
                  </g>
                ))}
                {belt(`M ${first.x + 4} ${outputY} H ${outputX}`, true)}
                {machines.slice(0, count).map((m) => (
                  <g key={m.id}>
                    {feedIndices.map((feed) => (
                      <g key={feed}>
                        {belt(
                          `M ${portX(m.x, feed)} ${inputY - feed * 1.6} V ${m.y - 1}`,
                        )}
                        <rect
                          className="supply-junction"
                          x={portX(m.x, feed) - 0.5}
                          y={inputY - feed * 1.6 - 0.5}
                          width="1"
                          height="1"
                          rx="0.2"
                          fill="#829ba3"
                          stroke="#26343c"
                          strokeWidth="0.15"
                        />
                      </g>
                    ))}
                    {belt(`M ${m.x + 4} ${m.y + 7} V ${outputY}`, true)}
                    <rect
                      className="supply-junction"
                      x={m.x + 3.4}
                      y={outputY - 0.6}
                      width="1.2"
                      height="1.2"
                      rx="0.2"
                      fill="#a29679"
                      stroke="#26343c"
                      strokeWidth="0.15"
                    />
                  </g>
                ))}
              </g>
            );
          })}
          <g
            className="transfer-module"
            aria-label="Symbolischer Etagenübergang"
          >
            <rect
              x={transferX}
              y={transferY - 5}
              width="7"
              height="10"
              rx="0.7"
              fill="#3b4852"
              stroke="#8a9ca7"
              strokeWidth="0.25"
            />
            <path
              className="transfer-detail"
              d={`M ${transferX + 2} ${transferY - 3} H ${transferX + 5} V ${transferY + 3} H ${transferX + 2} Z M ${transferX + 3.5} ${transferY - 2} V ${transferY + 2}`}
              fill="none"
              stroke="#b3c2cb"
              strokeWidth="0.35"
            />
            <text
              className="transfer-label"
              x={transferX + 3.5}
              y={transferY + 7}
              fontSize="1.6"
              fill="#a6b4be"
              textAnchor="middle"
            >
              TRANSFER
            </text>
          </g>
          {floor.machines.map((m) => (
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
                  feeds={feeds}
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
