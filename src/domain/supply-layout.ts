import { deriveBuildVariants } from './build-variants.js';
import type { Catalog } from './catalog.js';
import type { ProductionPlan } from './production.js';
import { getMachineGeometry } from './machine-geometry.js';
import { generateBeltRouting } from './belt-routing.js';
import {
  validateTechnology,
  requireTechnology,
  type TechnologyProfile,
} from './technology.js';

/** Logical schematic with separately sourced, version-bound machine geometry. */
export function generateSupplyLayout(
  catalog: Catalog,
  plan: ProductionPlan,
  profile: TechnologyProfile,
  rows: number,
  variant?: unknown,
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
  const build = deriveBuildVariants(plan, variant);
  const arrangements = build.floors.map((orientation) => {
    const node = plan.nodes.find((n) => n.itemId === orientation.itemId)!;
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
    let machineId = 0;
    const rowIds = rowCounts.map((count) =>
      Array.from({ length: count }, () => ++machineId),
    );
    const ordered = (reverseRows: boolean, reverseColumns: boolean) =>
      (reverseRows ? [...rowIds].reverse() : rowIds).flatMap((ids, row) =>
        reverseColumns !== (row % 2 === 1) ? [...ids].reverse() : ids,
      );
    return {
      itemId: node.itemId,
      rowCounts,
      input: ordered(
        orientation.inputSide === 'south',
        orientation.inputSide === 'east',
      ),
      output: ordered(
        orientation.outputSide === 'north',
        orientation.outputSide === 'west',
      ),
    };
  });
  const routing = generateBeltRouting(
    catalog,
    plan,
    technology,
    build.transfers,
    arrangements,
  );
  const blocks = build.floors.map((orientation) => {
    const node = plan.nodes.find((n) => n.itemId === orientation.itemId)!;
    const recipe = catalog.recipes.find((r) => r.id === node.recipeId);
    if (!recipe) throw new Error('Unbekanntes Layout-Rezept');
    requireTechnology(recipe, technology);
    const transport = routing.find((graph) => graph.itemId === node.itemId)!;
    const inputs = node.inputs.map((i) => ({
      ...orientation.inputs.find((input) => input.itemId === i.itemId)!,
      lines: transport.inputs.find((input) => input.itemId === i.itemId)!.lines,
    }));
    const output = {
      itemId: node.itemId,
      rate: node.rate,
      lines: transport.outputLines,
    };
    const target = plan.targets.find((t) => t.itemId === node.itemId);
    const targetOutput = target
      ? {
          ...target,
          lines: transport.outputs.find(
            (output) => output.terminalId === `target:${target.itemId}`,
          )!.lines,
        }
      : null;
    const rowCounts = arrangements.find(
      (a) => a.itemId === node.itemId,
    )!.rowCounts;
    const rowCount = rowCounts.length;
    const columns = Math.max(...rowCounts);
    const inputLines = inputs.reduce((sum, i) => sum + i.lines, 0);
    const laneCount = inputLines + transport.collectors + output.lines;
    if (laneCount > 256) throw new Error('Versorgungs-Kapazität überschritten');
    const width = columns * 14 + 16;
    const rowPitch = 12.5 + 8 + 3.2 * (inputLines + transport.collectors);
    const firstY = 8 + 3.2 * inputLines;
    const depth =
      firstY +
      (rowCount - 1) * rowPitch +
      12.5 +
      8 +
      3.2 * transport.collectors;
    return {
      ...orientation,
      itemId: node.itemId,
      machineId: node.machineId,
      machineCount: node.machineCount,
      rate: node.rate,
      rowCounts,
      width,
      depth,
      inputs,
      output,
      targetOutput,
      transport,
      machineGeometry: getMachineGeometry(
        catalog.catalogVersion,
        node.machineId,
      ),
      physicalFootprint: null,
      physicalPorts: null,
      machines: rowCounts.flatMap((count, row) =>
        Array.from({ length: count }, (_, column) => ({
          id:
            rowCounts.slice(0, row).reduce((sum, count) => sum + count, 0) +
            column +
            1,
          x: 8 + column * 14,
          row,
          y: firstY + row * rowPitch,
          width: 10,
          depth: 12.5,
        })),
      ),
      connections: {
        input: sidePoint(orientation.inputSide, width, depth, 0.4),
        output: sidePoint(orientation.outputSide, width, depth, 0.6),
        targetOutput: targetOutput
          ? sidePoint(orientation.outputSide, width, depth, 0.8)
          : null,
      },
    };
  });
  const footprint = {
    width: Math.max(
      64,
      ...blocks.map((b) => b.width + 24),
      build.transfers.length * 5 + 24,
    ),
    depth: Math.max(
      64,
      ...blocks.map((b) => b.depth + 24),
      build.transfers.length * 5 + 24,
    ),
  };
  return {
    units: 'logical' as const,
    build,
    transfers: build.transfers.map((t) => ({
      ...t,
      ...sidePoint(
        t.side,
        footprint.width,
        footprint.depth,
        (t.slot + 1) / (build.transfers.length + 1),
      ),
    })),
    footprint,
    floors: blocks.map((b, index) => ({
      ...b,
      index,
      footprint,
      transferIds: build.transfers
        .filter((t) => t.span.includes(index))
        .map((t) => t.id),
    })),
  };
}

/** Distinct aggregate connectors on one edge, in logical block coordinates. */
function sidePoint(
  side: import('./build-variants.js').BuildSide,
  width: number,
  depth: number,
  fraction: number,
) {
  return {
    side,
    x: side === 'west' ? 0 : side === 'east' ? width : width * fraction,
    y: side === 'north' ? 0 : side === 'south' ? depth : depth * fraction,
  };
}
