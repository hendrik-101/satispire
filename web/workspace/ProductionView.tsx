import type { ProductionPlan } from '../../src/domain/production.js';
import { itemName } from '../../src/domain/vanilla.js';
import { formatRate } from './format-rate.js';

export function ProductionView({
  plan,
  selected,
  select,
  onSizeInput,
}: {
  plan: ProductionPlan;
  selected: string;
  select: (id: string) => void;
  onSizeInput?: (stageItemId: string, itemId: string) => void;
}) {
  const stage = plan.nodes.find((node) => node.itemId === selected);
  return (
    <section className="production-panel" aria-label="Produktionsübersicht">
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
              <td title={`Exakt: ${node.rate} / min`}>
                {formatRate(node.rate)}
              </td>
              <td>
                {node.machineCount} × {itemName(node.machineId)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
    </section>
  );
}
