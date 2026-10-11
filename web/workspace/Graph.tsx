import type { Catalog } from '../../src/domain/catalog.js';
import type { ProductionPlan } from '../../src/domain/production.js';
import { displayName, graphConnections } from './model';

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
  const label = (id: string) =>
    displayName(catalog.items.find((item) => item.id === id)?.name ?? id);
  const edges = graphConnections(plan);
  const ids = [
    ...plan.imports.map((item) => item.itemId),
    ...plan.nodes.map((item) => item.itemId),
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
  const depths = new Map<string, number>();
  function depth(id: string): number {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    const incoming = edges.filter((edge) => edge.to === id);
    const result = incoming.length
      ? 1 + Math.max(...incoming.map((edge) => depth(edge.from)))
      : 0;
    depths.set(id, result);
    return result;
  }
  const rows = new Map<number, string[]>();
  for (const id of ids) {
    const level = depth(id);
    rows.set(level, [...(rows.get(level) ?? []), id]);
  }
  const width =
    Math.max(1, ...[...rows.values()].map((row) => row.length)) * 224;
  const height = Math.max(1, rows.size) * 154;
  const positions = new Map(
    ids.map((id) => {
      const row = rows.get(depth(id))!;
      return [id, { x: row.indexOf(id) * 224 + 12, y: depth(id) * 154 + 12 }];
    }),
  );
  return (
    <section className="graph-panel" aria-label="Produktionsgraph">
      <h2>Produktionsgraph</h2>
      <div className="graph-scroll">
        <svg
          width={width}
          height={height}
          viewBox={'0 0 ' + width + ' ' + height}
          aria-label="Materialverbindungen"
        >
          <defs>
            <marker
              id="flow-end"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#f39a45" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const from = positions.get(edge.from)!;
            const to = positions.get(edge.to)!;
            const active = edge.from === selected || edge.to === selected;
            const middle = (from.y + 94 + to.y) / 2;
            return (
              <g key={edge.from + '>' + edge.to}>
                <path
                  className={
                    'graph-edge' +
                    (active && motion && edges.length <= 128
                      ? ' moving-edge'
                      : '')
                  }
                  d={
                    'M ' +
                    (from.x + 100) +
                    ' ' +
                    (from.y + 94) +
                    ' V ' +
                    middle +
                    ' H ' +
                    (to.x + 100) +
                    ' V ' +
                    (to.y - 4)
                  }
                  markerEnd="url(#flow-end)"
                />
                <text
                  x={from.x + 112}
                  y={
                    from.y +
                    112 +
                    edges
                      .filter((candidate) => candidate.from === edge.from)
                      .findIndex((candidate) => candidate.to === edge.to) *
                      14
                  }
                  className="edge-label"
                >
                  {edge.rate} / min
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
                width={200}
                height={94}
              >
                {node ? (
                  <button
                    className={
                      'graph-node ' + (selected === id ? 'selected' : '')
                    }
                    onClick={() => select(id)}
                  >
                    <span>{label(id)}</span>
                    <strong>{item.rate} / min</strong>
                    <small>
                      {node.machineCount} ×{' '}
                      {catalog.machines.find((m) => m.id === node.machineId)
                        ?.name ?? node.machineId}
                    </small>
                  </button>
                ) : (
                  <div className="graph-node raw-stage">
                    <span>{label(id)}</span>
                    <strong>{item.rate} / min</strong>
                    <small>Import</small>
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
