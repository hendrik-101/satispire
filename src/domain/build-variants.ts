import { z } from 'zod';
import { CATALOG_ID_LIMIT, CATALOG_ID_PATTERN } from './catalog.js';
import type { ProductionPlan } from './production.js';
import { allocateProductionFlows } from './production-flows.js';

export const sideSchema = z.enum(['west', 'east', 'north', 'south']);
export type BuildSide = z.infer<typeof sideSchema>;
const itemId = z
  .string()
  .min(1)
  .max(CATALOG_ID_LIMIT)
  .regex(CATALOG_ID_PATTERN);
// Check length before Zod can spread/read entries, then copy bounded indexes.
// Raw WebMCP arrays may define a custom iterator; JSON array semantics use indexes.
const overridePreflight = z.unknown().transform((value, context) => {
  if (!Array.isArray(value)) return value;
  const count = value.length;
  if (!Number.isSafeInteger(count) || count < 0 || count > 64) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Floor overrides exceed the 64-entry limit',
    });
    return z.NEVER;
  }
  return Array.from({ length: count }, (_, index) => value[index]);
});
export const variantSchema = z
  .object({
    schemaVersion: z.literal(1),
    pattern: z.enum(['alternating', 'fixed']),
    inputSide: sideSchema,
    outputSide: sideSchema,
    overrides: overridePreflight.pipe(
      z
        .array(
          z
            .object({ itemId, inputSide: sideSchema, outputSide: sideSchema })
            .strict(),
        )
        .max(64),
    ),
  })
  .strict();
export type BuildVariant = z.infer<typeof variantSchema>;
export const defaultBuildVariant: BuildVariant = {
  schemaVersion: 1,
  pattern: 'alternating',
  inputSide: 'west',
  outputSide: 'east',
  overrides: [],
};
const sides: BuildSide[] = ['west', 'east', 'north', 'south'];
const around: BuildSide[] = ['west', 'north', 'east', 'south'];
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const distance = (a: BuildSide, b: BuildSide) => {
  const d = Math.abs(around.indexOf(a) - around.indexOf(b));
  return Math.min(d, 4 - d);
};

/** Dependency topology and perimeter preferences only; never physical belt/lift routing. */
export function deriveBuildVariants(
  plan: ProductionPlan,
  raw: unknown = defaultBuildVariant,
  rawItemIds?: readonly string[],
) {
  const variant = variantSchema.parse(raw);
  if (!plan.nodes.length || plan.nodes.length > 64)
    throw new Error('Invalid floor capacity');
  const nodes = new Map(plan.nodes.map((n) => [n.itemId, n]));
  if (nodes.size !== plan.nodes.length)
    throw new Error('Duplicate production stage');
  const imports = new Set(plan.imports.map((i) => i.itemId));
  const multiOutput = plan.nodes.some((node) => node.outputs !== undefined);
  const flows = multiOutput
    ? allocateProductionFlows(plan, rawItemIds).transfers
    : plan.nodes.flatMap((node) =>
        node.inputs
          .filter((input) => nodes.has(input.itemId))
          .map((input) => ({
            fromItemId: input.itemId,
            toItemId: node.itemId,
            ...input,
          })),
      );
  const parentsOf = (itemId: string) =>
    flows.filter((flow) => flow.toItemId === itemId);
  const overrides = new Map(variant.overrides.map((o) => [o.itemId, o]));
  if (overrides.size !== variant.overrides.length)
    throw new Error('Duplicate floor override');
  for (const id of overrides.keys())
    if (!nodes.has(id)) throw new Error('Unknown floor override');
  for (const node of nodes.values())
    for (const input of node.inputs) {
      if (
        !parentsOf(node.itemId).some((flow) => flow.itemId === input.itemId) &&
        !imports.has(input.itemId)
      )
        throw new Error('Unknown material input');
    }
  const ordered: string[] = [];
  const placed = new Set<string>();
  while (ordered.length < nodes.size) {
    const next = [...nodes.keys()]
      .filter((id) => !placed.has(id))
      .sort(compare)
      .find((id) => parentsOf(id).every((flow) => placed.has(flow.fromItemId)));
    const selected =
      next ??
      (multiOutput
        ? [...nodes.keys()].filter((id) => !placed.has(id)).sort(compare)[0]
        : undefined);
    if (!selected) throw new Error('Cyclic floor dependencies');
    ordered.push(selected);
    placed.add(selected);
  }
  const indices = new Map(ordered.map((id, index) => [id, index]));
  const resolvedOutputs = new Map<string, BuildSide>();
  const floors = ordered.map((itemId, index) => {
    const override = overrides.get(itemId);
    const parents = parentsOf(itemId);
    const cost = (side: BuildSide) =>
      parents.reduce(
        (sum, input) =>
          sum +
          distance(
            resolvedOutputs.get(input.fromItemId) ?? variant.outputSide,
            side,
          ),
        0,
      );
    // Prefer the configured pair on ties; unrelated stage insertion cannot flip a branch.
    const swapped =
      variant.pattern === 'alternating' &&
      cost(variant.outputSide) < cost(variant.inputSide);
    const inputSide =
      override?.inputSide ?? (swapped ? variant.outputSide : variant.inputSide);
    const outputSide =
      override?.outputSide ??
      (swapped ? variant.inputSide : variant.outputSide);
    resolvedOutputs.set(itemId, outputSide);
    return {
      itemId,
      index,
      swapped,
      inputSide,
      outputSide,
      inputs: [...nodes.get(itemId)!.inputs]
        .sort((a, b) => compare(a.itemId, b.itemId))
        .map((input) => ({
          ...input,
          side: inputSide,
          sourceFloor:
            indices.get(
              parents.find((flow) => flow.itemId === input.itemId)
                ?.fromItemId ?? '',
            ) ?? null,
        })),
    };
  });
  const transfers = floors
    .flatMap((to) =>
      [...parentsOf(to.itemId)]
        .sort(
          (a, b) =>
            compare(a.itemId, b.itemId) || compare(a.fromItemId, b.fromItemId),
        )
        .map((flow) => {
          const from = floors[indices.get(flow.fromItemId)!]!;
          const candidates = [
            ...new Set([from.outputSide, to.inputSide, ...sides]),
          ];
          const side = candidates.reduce((best, side) =>
            distance(from.outputSide, side) + distance(to.inputSide, side) <
            distance(from.outputSide, best) + distance(to.inputSide, best)
              ? side
              : best,
          );
          const siblings = flows.filter(
            (other) =>
              other.fromItemId === flow.fromItemId &&
              other.toItemId === flow.toItemId,
          );
          return {
            id: `transfer:${from.index}:${to.index}${siblings.length > 1 ? `:${flow.itemId}` : ''}`,
            fromItemId: from.itemId,
            toItemId: to.itemId,
            ...(multiOutput ? { itemId: flow.itemId } : {}),
            rate: flow.rate,
            fromFloor: from.index,
            toFloor: to.index,
            side,
            sideChanges:
              distance(from.outputSide, side) + distance(to.inputSide, side),
            span: Array.from(
              { length: Math.abs(to.index - from.index) + 1 },
              (_, i) => Math.min(from.index, to.index) + i,
            ),
          };
        }),
    )
    .map((transfer, slot) => ({ ...transfer, slot }));
  if (transfers.length > 256) throw new Error('Transfer capacity exceeded');
  return {
    schemaVersion: 1 as const,
    variant,
    floors,
    transfers,
    method: 'dependency-first-perimeter-distance' as const,
    physicalBuildability: 'not-verified' as const,
  };
}
