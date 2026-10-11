import { z } from 'zod';
import { type Catalog, validateCatalog } from './domain/catalog.js';
import { solveProduction } from './domain/production.js';
import { generateFloors } from './domain/geometry.js';
import { productionSchema } from './inputs.js';

export interface LayoutBindings {
  blocks: { itemId: string; blockId: string }[];
  connections: { connectionId: string; fromItemId: string; toItemId: string }[];
}

/** Preserve safe short IDs and reserve them before allocating bounded fallbacks. */
function geometryIds(sources: string[], prefix: string): Map<string, string> {
  const reserved = new Set(['__proto__', 'constructor', 'prototype']);
  const canPreserve = (source: string) =>
    source.length <= 128 && !reserved.has(source);
  const used = new Set(sources.filter(canPreserve));
  const result = new Map<string, string>();
  let sequence = 0;
  for (const source of sources) {
    if (canPreserve(source)) {
      result.set(source, source);
      continue;
    }
    let candidate: string;
    do {
      candidate = `${prefix}:${sequence++}`;
    } while (used.has(candidate));
    used.add(candidate);
    result.set(source, candidate);
  }
  return result;
}

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
  const blockIds = geometryIds(
    production.nodes.map((node) => node.itemId),
    'generated:block',
  );
  const blocks = production.nodes.map((node, floor) => ({
    id: blockIds.get(node.itemId)!,
    floor,
    count: node.machineCount,
    rows: Math.min(input.layout.rows, node.machineCount),
  }));
  const nodeIds = new Set(production.nodes.map((node) => node.itemId));
  const links = production.nodes.flatMap((node) =>
    node.inputs
      .filter((part) => nodeIds.has(part.itemId))
      .map((part) => ({
        sourceId: `${part.itemId}->${node.itemId}`,
        fromItemId: part.itemId,
        toItemId: node.itemId,
      })),
  );
  const connectionIds = geometryIds(
    links.map((link) => link.sourceId),
    'generated:connection',
  );
  const connections = links.map((link) => ({
    id: connectionIds.get(link.sourceId)!,
    fromBlock: blockIds.get(link.fromItemId)!,
    toBlock: blockIds.get(link.toItemId)!,
  }));
  const layoutBindings: LayoutBindings = {
    blocks: production.nodes.map((node) => ({
      itemId: node.itemId,
      blockId: blockIds.get(node.itemId)!,
    })),
    connections: links.map((link) => ({
      connectionId: connectionIds.get(link.sourceId)!,
      fromItemId: link.fromItemId,
      toItemId: link.toItemId,
    })),
  };
  const layout = generateFloors({
    footprint: input.layout.footprint,
    floorCount: blocks.length,
    floorHeight: input.layout.floorHeight,
    blocks,
    connections,
  });
  return { schemaVersion: 1 as const, production, layout, layoutBindings };
}
