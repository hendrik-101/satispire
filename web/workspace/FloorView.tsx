import type { Catalog } from '../../src/domain/catalog.js';
import type {
  ProductionInput,
  ProductionPlan,
} from '../../src/domain/production.js';
import { buildPlanDocument } from '../../src/planning.js';
import { displayName } from './model';
export function FloorView({
  catalog,
  input,
  plan,
  selected,
  zoom,
  rows,
}: {
  catalog: Catalog;
  input: ProductionInput;
  plan: ProductionPlan;
  selected: string;
  zoom: number;
  rows: number;
}) {
  const index = Math.max(
    0,
    plan.nodes.findIndex((node) => node.itemId === selected),
  );
  const node = plan.nodes[index];
  const game = catalog.provenance.kind !== 'synthetic';
  let shape:
    | ReturnType<typeof buildPlanDocument>['layout']['floors'][number]
    | undefined;
  let error = '';
  if (!game) {
    try {
      shape = buildPlanDocument(
        {
          schemaVersion: 1,
          production: input,
          layout: { footprint: { width: 64, depth: 64 }, floorHeight: 8, rows },
        },
        catalog,
      ).layout.floors[index];
    } catch (failure) {
      error =
        failure instanceof Error
          ? failure.message
          : 'Anordnung nicht verfügbar';
    }
  }
  return (
    <section className="floor-panel" aria-label="Etagenansicht">
      <div className="canvas-heading">
        <h2>{game ? 'Stufenübersicht' : 'Etage ' + (index + 1)}</h2>
        <span>{game ? 'Geometrie unbekannt' : 'Synthetisches Layout'}</span>
      </div>
      <div className="drawing">
        {game ? (
          <div className="unverified-stage">
            <div className="stage-symbol" aria-hidden="true">
              ▦
            </div>
            <h3>{node ? displayName(node.itemId) : 'Stufe wählen'}</h3>
            {node && (
              <>
                <strong>{node.rate} / min</strong>
                <p>
                  {node.machineCount} × {displayName(node.machineId)}
                </p>
              </>
            )}
            <p>Physische Geometrie und Ports unbekannt.</p>
            <p className="muted">
              Produktionsraten sind berechnet. Eine baubare Etage benötigt
              verifizierte Maschinenmaße und Anschlüsse.
            </p>
          </div>
        ) : shape ? (
          <svg
            viewBox="0 0 68 68"
            role="img"
            aria-label={'Synthetische Etage ' + (index + 1)}
            style={{ width: Math.min(100, zoom * 80) + '%' }}
          >
            <rect
              x="2"
              y="2"
              width="64"
              height="64"
              className="floor-outline"
            />
            {shape.reservedCorridors.map((corridor, i) => (
              <rect
                key={i}
                x={corridor.x + 2}
                y={corridor.y + 2}
                width={corridor.width}
                height={corridor.depth}
                className="corridor"
              />
            ))}
            {shape.blocks.map((block) => (
              <g
                key={block.id}
                transform={
                  'translate(' +
                  (block.bounds.x + 2) +
                  ' ' +
                  (block.bounds.y + 2) +
                  ')'
                }
              >
                <rect
                  width={block.bounds.width}
                  height={block.bounds.depth}
                  className="block-outline"
                />
                {block.block.machines.slice(0, 512).map((machine) => (
                  <g key={machine.id}>
                    <rect
                      x={machine.bounds.x}
                      y={machine.bounds.y}
                      width={machine.bounds.width}
                      height={machine.bounds.depth}
                      className="machine"
                    />
                    <text
                      x={machine.bounds.x + machine.bounds.width / 2}
                      y={machine.bounds.y + machine.bounds.depth / 2}
                      className="machine-label"
                    >
                      {machine.id.replace('machine-', '')}
                    </text>
                  </g>
                ))}
              </g>
            ))}
          </svg>
        ) : (
          <p role="alert">{error || 'Keine Anordnung verfügbar.'}</p>
        )}
      </div>
      <p className="canvas-note">
        {game
          ? 'Unverifizierter lokaler Datenimport · keine Layoutfreigabe'
          : 'Logische Rastereinheiten · keine Satisfactory-Maße oder Bandführung'}
      </p>
    </section>
  );
}
