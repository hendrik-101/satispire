import type {
  SessionPresence,
  SessionPresenceInput,
} from '../../src/session-plan.js';
import { RemoteCursors } from './RemoteCursors.js';
import type { ProductionPlan } from '../../src/domain/production.js';
import { localizedName as itemName } from './labels.js';
import { productionOutputs } from '../../src/domain/production-flows.js';
import { formatRate } from './format-rate.js';

export function ProductionView({
  plan,
  selected,
  select,
  onSizeInput,
  peers = [],
  onPresence,
}: {
  plan: ProductionPlan;
  selected: string;
  select: (id: string) => void;
  onSizeInput?: (stageItemId: string, itemId: string) => void;
  peers?: SessionPresence[];
  onPresence?: (cursor: SessionPresenceInput['cursor']) => void;
}) {
  const stage = plan.nodes.find((node) => node.itemId === selected);
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
            <th scope="col">Ausgänge / min</th>
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
              <td>
                {productionOutputs(node).map((output) => (
                  <div
                    key={output.itemId}
                    title={`Exakt: ${output.rate} / min`}
                  >
                    {itemName(output.itemId)} · {formatRate(output.rate)} / min
                  </div>
                ))}
              </td>
              <td>
                {node.machineCount} × {itemName(node.machineId)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(plan.surplus ?? []).length > 0 && (
        <section aria-label="Überschuss der Fabrik">
          <h3>Überschuss der Fabrik</h3>
          <dl>
            {plan.surplus!.map((output) => (
              <div key={output.itemId}>
                <dt>{itemName(output.itemId)}</dt>
                <dd>{formatRate(output.rate)} / min</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {stage && onSizeInput && stage.inputs.length > 0 && (
        <div className="production-input-sizing">
          <h3>Gewählte Stufe: {itemName(stage.itemId)}</h3>
          <dl>
            {stage.inputs.map((input) => (
              <div key={input.itemId}>
                <dt>{itemName(input.itemId)}</dt>
                <dd>
                  <span title={`Exakt: ${input.rate} / min`}>
                    {formatRate(input.rate)} / min
                  </span>{' '}
                  <button
                    type="button"
                    onClick={() => onSizeInput(stage.itemId, input.itemId)}
                    aria-label={`Auf diese Eingangsmenge skalieren: ${itemName(stage.itemId)}, ${itemName(input.itemId)}`}
                  >
                    Auf diese Eingangsmenge skalieren
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <RemoteCursors peers={peers} />
    </section>
  );
}
