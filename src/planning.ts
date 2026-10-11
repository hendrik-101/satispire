import { z } from 'zod';
import { type Catalog, validateCatalog } from './domain/catalog.js';
import { solveProduction } from './domain/production.js';
import { generateFloors } from './domain/geometry.js';
import { productionSchema } from './inputs.js';
const documentSchema = z
  .object({
    schemaVersion: z.literal(1),
    production: productionSchema,
    layout: z
      .object({
        footprint: z
          .object({
            width: z.number().int().min(1).max(4096),
            depth: z.number().int().min(1).max(4096),
          })
          .strict(),
        floorHeight: z.number().int().min(1).max(256),
        rows: z.number().int().min(1).max(256),
      })
      .strict(),
  })
  .strict();
/** One automatically arranged stage per story. Only synthetic geometry is supported. */
export function buildPlanDocument(raw: unknown, catalogInput: Catalog) {
  const input = documentSchema.parse(raw);
  const catalog = validateCatalog(catalogInput);
  const production = solveProduction(catalog, input.production);
  if (production.nodes.length === 0)
    throw new Error('Layout requires at least one manufactured stage');
  const blocks = production.nodes.map((node, floor) => ({
    id: node.itemId,
    floor,
    count: node.machineCount,
    rows: Math.min(input.layout.rows, node.machineCount),
  }));
  const nodeIds = new Set(production.nodes.map((node) => node.itemId));
  const connections = production.nodes.flatMap((node) =>
    node.inputs
      .filter((part) => nodeIds.has(part.itemId))
      .map((part) => ({
        id: `${part.itemId}->${node.itemId}`,
        fromBlock: part.itemId,
        toBlock: node.itemId,
      })),
  );
  const layout = generateFloors({
    footprint: input.layout.footprint,
    floorCount: blocks.length,
    floorHeight: input.layout.floorHeight,
    blocks,
    connections,
  });
  return { schemaVersion: 1 as const, production, layout };
}
