import type { Catalog } from './catalog.js';
import type { ProductionPlan } from './production.js';
import {
  supplyLines,
  validateTechnology,
  requireTechnology,
  type TechnologyProfile,
} from './technology.js';

/** A schematic projection in logical units. Unknown game measurements stay null. */
export function generateSupplyLayout(
  catalog: Catalog,
  plan: ProductionPlan,
  profile: TechnologyProfile,
  rows: number,
) {
  const technology = validateTechnology(profile, catalog);
  if (plan.nodes.length === 0)
    throw new Error('Layout benötigt eine Produktionsstufe.');
  if (!Number.isSafeInteger(rows) || rows < 0 || rows > 64)
    throw new Error('Ungültige Reihenanzahl');
  if (plan.catalogVersion !== catalog.catalogVersion)
    throw new Error('Katalogversion passt nicht');
  if (plan.nodes.length > 64 || plan.nodes.some((n) => n.machineCount > 512))
    throw new Error('Layout-Kapazität überschritten');
  const blocks = plan.nodes.map((node) => {
    const recipe = catalog.recipes.find((r) => r.id === node.recipeId);
    if (!recipe) throw new Error('Unbekanntes Layout-Rezept');
    requireTechnology(recipe, technology);
    const inputs = node.inputs.map((i) => ({
      ...i,
      lines: supplyLines(catalog, i.itemId, i.rate, technology),
    }));
    const output = {
      itemId: node.itemId,
      rate: node.rate,
      lines: supplyLines(catalog, node.itemId, node.rate, technology),
    };
    const rowCount = Math.min(
      node.machineCount,
      rows || Math.max(1, Math.ceil(Math.sqrt(node.machineCount))),
    );
    const rowCounts = Array.from(
      { length: rowCount },
      (_, i) =>
        Math.floor(node.machineCount / rowCount) +
        (i < node.machineCount % rowCount ? 1 : 0),
    );
    const columns = Math.max(...rowCounts);
    const laneCount =
      inputs.reduce((sum, i) => sum + i.lines, 0) + output.lines;
    if (laneCount > 256) throw new Error('Versorgungs-Kapazität überschritten');
    const width = columns * 14 + 16;
    const depth = rowCount * 16 + 12 + laneCount * 2;
    return {
      itemId: node.itemId,
      machineId: node.machineId,
      rowCounts,
      width,
      depth,
      inputs,
      output,
      physicalFootprint: null,
      physicalPorts: null,
      machines: rowCounts.flatMap((count, row) =>
        Array.from({ length: count }, (_, column) => ({
          id:
            rowCounts.slice(0, row).reduce((sum, count) => sum + count, 0) +
            column +
            1,
          x: 8 + column * 14,
          y: 8 + row * 16,
          width: 8,
          depth: 6,
        })),
      ),
      connections: {
        input: { side: 'east' as const, x: width, y: depth - 8 },
        output: { side: 'east' as const, x: width, y: depth - 4 },
      },
    };
  });
  const footprint = {
    width: Math.max(80, ...blocks.map((b) => b.width + 24)),
    depth: Math.max(64, ...blocks.map((b) => b.depth + 16)),
  };
  return {
    units: 'logical' as const,
    footprint,
    floors: blocks.map((b, index) => ({
      ...b,
      index,
      footprint,
      lift: {
        x: footprint.width - 12,
        y: 4,
        width: 8,
        depth: footprint.depth - 8,
      },
    })),
  };
}
