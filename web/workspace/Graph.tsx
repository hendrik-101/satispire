import { useId } from 'react';
import { MachineGlyph } from './MachineGlyph';
import type { Catalog } from '../../src/domain/catalog.js';
import type { ProductionPlan } from '../../src/domain/production.js';
import { displayName, graphConnections } from './model';
import { formatRate } from './format-rate.js';
import { graphLayout } from './graph-layout.js';
import { resourceColor } from './resource-colors.js';
import { localizedName } from './labels.js';

export function Graph({
  plan,
  catalog,
  selected,
  select,
  motion,
}: {
  plan: ProductionPlan;
  catalog: Catalog;
  selected: string;
  select: (id: string) => void;
  motion: boolean;
}) {
  const markerId = useId().replace(/:/g, '');
  const label = (id: string) =>
    localizedName(
      id,
      catalog.items.find((item) => item.id === id)?.name ?? displayName(id),
    );
  const machineLabel = (id: string) =>
    localizedName(
      id,
      catalog.machines.find((machine) => machine.id === id)?.name ??
        displayName(id),
    );
  const edges = graphConnections(plan);
  const ids = [
    ...new Set([
      ...plan.imports.map((item) => item.itemId),
      ...plan.nodes.map((item) => item.itemId),
    ]),
  ];
  if (ids.length > 256 || edges.length > 1024) {
    return (
      <section className="graph-panel" aria-label="Produktionsgraph">
        <h2>Produktionsgraph</h2>
        <p role="status">
          Graph zu groß für diese Darstellung (maximal 256 Knoten / 1024
          Verbindungen). Der berechnete Plan bleibt in der Stufennavigation
          verfügbar.
        </p>
      </section>
    );
  }
  const { depths, positions, width, contentHeight } = graphLayout(ids, edges);
  const bypassEdges = edges.filter(
    (edge) => depths.get(edge.to)! - depths.get(edge.from)! > 1,
  );
  const height =
    contentHeight + (bypassEdges.length ? 16 + bypassEdges.length * 8 : 0);
  const activeEdges = new Set<(typeof edges)[number]>();
  for (const upstream of [true, false]) {
    const pending = [selected];
    const visited = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const edge of edges.filter((candidate) =>
        upstream ? candidate.to === id : candidate.from === id,
      )) {
        activeEdges.add(edge);
        pending.push(upstream ? edge.from : edge.to);
      }
    }
  }
  return (
    <section className="graph-panel" aria-label="Produktionsgraph">
      <div className="graph-heading">
        <h2>Produktionsgraph</h2>
        <span className="graph-summary">{plan.nodes.length} Stufen</span>
      </div>
      <div className="graph-scroll">
        <svg
          className="process-graph"
          style={{ width: `max(100%, ${width}px)`, height }}
          width={width}
          height={height}
          viewBox={'0 0 ' + width + ' ' + height}
          preserveAspectRatio="xMinYMid meet"
          aria-label="Materialverbindungen"
        >
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
          </defs>
          {edges.map((edge, index) => {
            const from = positions.get(edge.from)!;
            const to = positions.get(edge.to)!;
            const active = activeEdges.has(edge);
            const color = resourceColor(edge.from);
            const outputs = edges
              .filter((candidate) => candidate.from === edge.from)
              .sort((a, b) => positions.get(a.to)!.y - positions.get(b.to)!.y);
            const inputs = edges
              .filter((candidate) => candidate.to === edge.to)
              .sort(
                (a, b) => positions.get(a.from)!.y - positions.get(b.from)!.y,
              );
            const startX = from.x + 176;
            const startY =
              from.y +
              (92 * (outputs.indexOf(edge) + 1)) / (outputs.length + 1);
            const endY =
              to.y + (92 * (inputs.indexOf(edge) + 1)) / (inputs.length + 1);
            const bypassIndex = bypassEdges.indexOf(edge);
            const bypassY = contentHeight + 8 + bypassIndex * 8;
            // Distinct stems stay inside the 64px inter-column gap.
            const exitX =
              startX +
              32 -
              (20 * (outputs.indexOf(edge) + 1)) / (outputs.length + 1);
            const entryX =
              to.x -
              32 +
              (20 * (inputs.indexOf(edge) + 1)) / (inputs.length + 1);
            const path =
              bypassIndex < 0
                ? `M ${startX} ${startY} C ${startX + 32} ${startY}, ${to.x - 32} ${endY}, ${to.x - 5} ${endY}`
                : `M ${startX} ${startY} H ${exitX} V ${bypassY} H ${entryX} V ${endY} H ${to.x - 5}`;
            return (
              <g key={edge.from + '>' + edge.to + ':' + index}>
                <path
                  className={
                    'graph-edge' +
                    (active ? ' active' : '') +
                    (active && motion && edges.length <= 128
                      ? ' moving-edge'
                      : '')
                  }
                  d={path}
                  stroke={color}
                  markerEnd={`url(#${markerId})`}
                />
                <circle
                  className={'graph-port' + (active ? ' active' : '')}
                  stroke={color}
                  cx={startX}
                  cy={startY}
                  r={3}
                />
                <circle
                  className={'graph-port' + (active ? ' active' : '')}
                  stroke={color}
                  cx={to.x}
                  cy={endY}
                  r={3}
                />
                <text
                  x={startX + 6}
                  y={startY - 7}
                  className={'edge-label' + (active ? ' active' : '')}
                >
                  {formatRate(edge.rate)}/min
                </text>
              </g>
            );
          })}
          {ids.map((id) => {
            const position = positions.get(id)!;
            const node = plan.nodes.find((node) => node.itemId === id);
            const item =
              node ?? plan.imports.find((item) => item.itemId === id)!;
            return (
              <foreignObject
                key={id}
                x={position.x}
                y={position.y}
                width={176}
                height={92}
              >
                {node ? (
                  <button
                    type="button"
                    aria-pressed={selected === id}
                    className={
                      'graph-node ' + (selected === id ? 'selected' : '')
                    }
                    onClick={() => select(id)}
                  >
                    <span className="graph-node-glyph" aria-hidden="true">
                      <MachineGlyph
                        machineId={node.machineId}
                        feeds={node.inputs.length}
                        inputItems={node.inputs.map((input) => input.itemId)}
                        outputItem={node.itemId}
                        selected={selected === id}
                      />
                    </span>
                    <span className="graph-node-copy">
                      <span className="graph-node-name" title={label(id)}>
                        {label(id)}
                      </span>
                      <strong className="graph-node-rate">
                        {formatRate(item.rate)} <small>/ min</small>
                      </strong>
                      <small
                        className="graph-node-machine"
                        title={machineLabel(node.machineId)}
                      >
                        {node.machineCount} × {machineLabel(node.machineId)}
                      </small>
                    </span>
                  </button>
                ) : (
                  <div className="graph-node raw-stage">
                    <span className="graph-node-glyph" aria-hidden="true">
                      <svg className="graph-import-icon" viewBox="0 0 40 40">
                        <path
                          d="M7 12 20 5l13 7v16l-13 7-13-7Z M7 12l13 7 13-7 M20 19v16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                      </svg>
                    </span>
                    <span className="graph-node-copy">
                      <span className="graph-node-name" title={label(id)}>
                        {label(id)}
                      </span>
                      <strong className="graph-node-rate">
                        {formatRate(item.rate)} <small>/ min</small>
                      </strong>
                      <small className="graph-node-machine">Zufuhr</small>
                    </span>
                  </div>
                )}
              </foreignObject>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
