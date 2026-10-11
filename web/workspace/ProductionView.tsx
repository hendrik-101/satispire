import type { ProductionPlan } from '../../src/domain/production.js';
import { itemName } from '../../src/domain/vanilla.js';

export function ProductionView({
  plan,
  selected,
  select,
}: {
  plan: ProductionPlan;
  selected: string;
  select: (id: string) => void;
}) {
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
              <td>{node.rate}</td>
              <td>
                {node.machineCount} × {itemName(node.machineId)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
