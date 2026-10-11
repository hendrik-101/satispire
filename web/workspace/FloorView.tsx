import type { Catalog } from '../../src/domain/catalog.js';
import type { ProductionPlan } from '../../src/domain/production.js';
import type { TechnologyProfile } from '../../src/domain/technology.js';
import { generateSupplyLayout } from '../../src/domain/supply-layout.js';
import { itemName } from '../../src/domain/vanilla.js';
export function FloorView({
  catalog,
  plan,
  technology,
  selected,
  zoom,
  rows,
}: {
  catalog: Catalog;
  plan: ProductionPlan;
  technology: TechnologyProfile;
  selected: string;
  zoom: number;
  rows: number;
}) {
  const layout = generateSupplyLayout(catalog, plan, technology, rows);
  const floor =
    layout.floors.find((f) => f.itemId === selected) ?? layout.floors[0]!;
  const { width, depth } = layout.footprint;
  return (
    <section className="floor-panel" aria-label="Etagenansicht">
      <div className="canvas-heading">
        <h2>
          Etage {floor.index + 1} <span> / {layout.floors.length}</span>
        </h2>
        <span>Blockschema · {itemName(floor.machineId)}</span>
      </div>
      <div className="drawing">
        <svg
          viewBox={`-6 -6 ${width + 12} ${depth + 12}`}
          role="img"
          aria-label={`Blockschema ${itemName(floor.itemId)}`}
          style={{ width: zoom * 90 + '%' }}
        >
          <defs>
            <marker
              id="supply-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto"
            >
              <path d="M0 0 10 5 0 10z" fill="#83b9ed" />
            </marker>
          </defs>
          <rect width={width} height={depth} className="floor-outline" />
          <rect
            x="2"
            y="2"
            width={floor.width}
            height={floor.depth}
            className="block-outline"
          />
          {floor.machines.map((m) => (
            <g key={m.id}>
              <rect
                x={m.x}
                y={m.y}
                width={m.width}
                height={m.depth}
                rx="0.5"
                className="machine"
              />
              <text
                x={m.x + m.width / 2}
                y={m.y + m.depth / 2}
                className="machine-label"
              >
                {m.id}
              </text>
            </g>
          ))}
          {floor.rowCounts.map((count, row) => (
            <g key={row}>
              <path
                d={`M ${floor.width} ${floor.depth - 8} H 4 V ${5 + row * 16} H ${count * 14 + 2}`}
                className="manifold-input"
              />
              <path
                d={`M 12 ${17 + row * 16} H ${floor.width - 4} V ${floor.depth - 4} H ${floor.width}`}
                className="manifold-output"
              />
            </g>
          ))}
          <rect
            x={floor.lift.x}
            y={floor.lift.y}
            width={floor.lift.width}
            height={floor.lift.depth}
            className="corridor"
          />
          <path
            d={`M ${floor.connections.output.x} ${floor.connections.output.y} H ${floor.lift.x + 4}`}
            className="lift-link"
            markerEnd="url(#supply-arrow)"
          />
          <path
            d={`M ${floor.lift.x + 4} ${floor.connections.input.y - 2} H ${floor.connections.input.x}`}
            className="lift-link"
            markerEnd="url(#supply-arrow)"
          />
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
