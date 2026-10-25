import type {
  SessionPresence,
  SessionPresenceInput,
} from '../../src/session-plan.js';
import { RemoteCursors } from './RemoteCursors.js';
import type { ProductionPlan } from '../../src/domain/production.js';
import { itemName } from '../../src/domain/vanilla.js';

export function ProductionView({
  plan,
  selected,
  select,
  peers = [],
  onPresence,
}: {
  plan: ProductionPlan;
  selected: string;
  select: (id: string) => void;
  peers?: SessionPresence[];
  onPresence?: (cursor: SessionPresenceInput['cursor']) => void;
}) {
  return (
    <section
      className="production-panel"
      aria-label="Produktionsübersicht"
      onPointerLeave={() => onPresence?.(null)}
      onPointerCancel={() => onPresence?.(null)}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width && rect.height)
          onPresence?.({
            x: Math.max(
              0,
              Math.min(1, (event.clientX - rect.left) / rect.width),
            ),
            y: Math.max(
              0,
              Math.min(1, (event.clientY - rect.top) / rect.height),
            ),
          });
      }}
    >
      <h2>Produktion</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Stufe</th>
            <th scope="col">/ min</th>
            <th scope="col">Maschinen</th>
          </tr>
        </thead>
        <tbody>
          {plan.nodes.map((node) => (
            <tr key={node.itemId} aria-selected={selected === node.itemId}>
              <th scope="row">
                <button type="button" onClick={() => select(node.itemId)}>
                  {itemName(node.itemId)}
                </button>
              </th>
              <td>{node.rate}</td>
              <td>
                {node.machineCount} × {itemName(node.machineId)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <RemoteCursors peers={peers} />
    </section>
  );
}
