import type { ItemRate, ProductionNode, ProductionPlan } from './production.js';
import { Rational } from './rational.js';

export interface ProductionTransfer extends ItemRate {
  /** Canonical stage identities; itemId identifies the transported material. */
  fromItemId: string;
  toItemId: string;
}
export interface ProductionDelivery extends ItemRate {
  fromItemId: string;
}

/** Legacy stages omit outputs and produce exactly their canonical item and rate. */
export function productionOutputs(node: ProductionNode): ItemRate[] {
  return node.outputs ?? [{ itemId: node.itemId, rate: node.rate }];
}

export const FLOW_ALLOCATION_WORK_LIMIT = 250_000;
const ZERO = Rational.parse('0');
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Allocate each produced unit once: stage inputs, targets, then excess outlets.
 * An exact, memoized activation search avoids manufactured feedback, including
 * allocations that need an earlier ready sink to wait for another producer.
 * Raw materials may recycle, including when their net import is zero; callers
 * with a catalog must supply its complete raw identities in rawItemIds.
 */
export function allocateProductionFlows(
  plan: ProductionPlan,
  rawItemIds: readonly string[] = plan.imports.map((input) => input.itemId),
) {
  let work = 0;
  const spend = () => {
    if (++work > FLOW_ALLOCATION_WORK_LIMIT)
      throw new Error(
        `Production flow allocation exceeds the ${FLOW_ALLOCATION_WORK_LIMIT}-unit work bound`,
      );
  };
  const raw = new Set(rawItemIds);
  const lexical = [...plan.nodes].sort((a, b) => compare(a.itemId, b.itemId));
  const stages = lexical.map((node, index) => {
    const inputs = node.inputs
      .filter((input) => !raw.has(input.itemId))
      .map((input) => {
        spend();
        return {
          itemId: input.itemId,
          rate: Rational.parseCanonical(input.rate),
        };
      });
    const changes = new Map<string, Rational>();
    for (const input of inputs)
      changes.set(
        input.itemId,
        (changes.get(input.itemId) ?? ZERO).subtract(input.rate),
      );
    const outputs: { itemId: string; rate: Rational }[] = [];
    for (const output of productionOutputs(node)) {
      spend();
      if (!raw.has(output.itemId)) {
        outputs.push({
          itemId: output.itemId,
          rate: Rational.parseCanonical(output.rate),
        });
        changes.set(
          output.itemId,
          (changes.get(output.itemId) ?? ZERO).add(
            Rational.parseCanonical(output.rate),
          ),
        );
      }
    }
    return { node, inputs, outputs, changes, bit: 1n << BigInt(index) };
  });
  const complete = (1n << BigInt(stages.length)) - 1n;
  // Ignoring consumption gives an upper bound on every attainable inventory.
  // A stage unavailable even in this relaxation cannot occur in any ordering.
  const potential = new Map<string, Rational>();
  let reachable = 0n;
  while (reachable !== complete) {
    let changed = false;
    for (const stage of stages) {
      spend();
      if ((reachable & stage.bit) !== 0n) continue;
      if (
        !stage.inputs.every((input) => {
          spend();
          return (potential.get(input.itemId) ?? ZERO).compare(input.rate) >= 0;
        })
      )
        continue;
      reachable |= stage.bit;
      changed = true;
      for (const output of stage.outputs) {
        spend();
        potential.set(
          output.itemId,
          (potential.get(output.itemId) ?? ZERO).add(output.rate),
        );
      }
    }
    if (!changed)
      throw new Error(
        `Selected recipe flow cycle or unsatisfied manufactured demand: ${lexical.map((node) => node.itemId).join(' -> ')}`,
      );
  }
  const inventory = new Map<string, Rational>();
  const apply = (index: number, undo: boolean) => {
    for (const [itemId, change] of stages[index]!.changes) {
      spend();
      const current = inventory.get(itemId) ?? ZERO;
      const next = undo ? current.subtract(change) : current.add(change);
      if (next.compare(ZERO) === 0) inventory.delete(itemId);
      else inventory.set(itemId, next);
    }
  };
  const failed = new Set<bigint>();
  const path: number[] = [];
  const frames: { placed: bigint; next: number; stage?: number }[] = [
    { placed: 0n, next: 0 },
  ];
  while (frames.length && frames.at(-1)!.placed !== complete) {
    const frame = frames.at(-1)!;
    let advanced = false;
    while (frame.next < stages.length) {
      spend();
      const index = frame.next++;
      const stage = stages[index]!;
      if ((frame.placed & stage.bit) !== 0n) continue;
      const placed = frame.placed | stage.bit;
      if (failed.has(placed)) continue;
      if (
        !stage.inputs.every((input) => {
          spend();
          return (inventory.get(input.itemId) ?? ZERO).compare(input.rate) >= 0;
        })
      )
        continue;
      apply(index, false);
      path.push(index);
      frames.push({ placed, next: 0, stage: index });
      advanced = true;
      break;
    }
    if (!advanced) {
      failed.add(frame.placed);
      frames.pop();
      if (frame.stage !== undefined) {
        apply(frame.stage, true);
        path.pop();
      }
    }
  }
  if (!frames.length)
    throw new Error(
      `Selected recipe flow cycle or unsatisfied manufactured demand: ${lexical.map((node) => node.itemId).join(' -> ')}`,
    );
  const ordered = path.map((index) => stages[index]!.node);
  const ranks = new Map(ordered.map((node, index) => [node.itemId, index]));
  const producers = new Map<
    string,
    { fromItemId: string; remaining: Rational }[]
  >();
  for (const node of ordered)
    for (const output of productionOutputs(node)) {
      spend();
      const list = producers.get(output.itemId) ?? [];
      list.push({
        fromItemId: node.itemId,
        remaining: Rational.parseCanonical(output.rate),
      });
      producers.set(output.itemId, list);
    }
  const transfers: ProductionTransfer[] = [];
  const targets: ProductionDelivery[] = [];
  const surplus: ProductionDelivery[] = [];
  const importSupply = new Map(
    plan.imports.map((input) => [
      input.itemId,
      Rational.parseCanonical(input.rate),
    ]),
  );
  const imports: (ItemRate & { toItemId: string })[] = [];
  const allocate = (itemId: string, rate: string, toItemId?: string) => {
    let remaining = Rational.parseCanonical(rate);
    const external = importSupply.get(itemId) ?? ZERO;
    const imported = external.compare(remaining) < 0 ? external : remaining;
    if (imported.compare(ZERO) > 0) {
      if (toItemId !== undefined)
        imports.push({ toItemId, itemId, rate: imported.toString() });
      importSupply.set(itemId, external.subtract(imported));
      remaining = remaining.subtract(imported);
    }
    for (const source of producers.get(itemId) ?? []) {
      spend();
      if (
        source.remaining.compare(ZERO) <= 0 ||
        (toItemId !== undefined &&
          !raw.has(itemId) &&
          ranks.get(source.fromItemId)! >= ranks.get(toItemId)!)
      )
        continue;
      const share =
        source.remaining.compare(remaining) < 0 ? source.remaining : remaining;
      if (share.compare(ZERO) <= 0) break;
      const flow = {
        fromItemId: source.fromItemId,
        itemId,
        rate: share.toString(),
      };
      if (toItemId !== undefined) transfers.push({ ...flow, toItemId });
      else targets.push(flow);
      source.remaining = source.remaining.subtract(share);
      remaining = remaining.subtract(share);
    }
    if (remaining.compare(ZERO) > 0)
      throw new Error(`Material demand exceeds production: ${itemId}`);
  };
  for (const node of ordered)
    for (const input of [...node.inputs].sort((a, b) =>
      compare(a.itemId, b.itemId),
    ))
      allocate(input.itemId, input.rate, node.itemId);
  for (const target of [...plan.targets].sort((a, b) =>
    compare(a.itemId, b.itemId),
  ))
    allocate(target.itemId, target.rate);
  const excess = new Map<string, Rational>();
  for (const [itemId, sources] of [...producers].sort(([a], [b]) =>
    compare(a, b),
  ))
    for (const source of [...sources].sort((a, b) =>
      compare(a.fromItemId, b.fromItemId),
    )) {
      spend();
      if (source.remaining.compare(ZERO) > 0) {
        surplus.push({
          fromItemId: source.fromItemId,
          itemId,
          rate: source.remaining.toString(),
        });
        excess.set(itemId, (excess.get(itemId) ?? ZERO).add(source.remaining));
      }
    }
  const declared = new Map(
    (plan.surplus ?? []).map((entry) => [
      entry.itemId,
      Rational.parseCanonical(entry.rate),
    ]),
  );
  if (
    excess.size !== declared.size ||
    [...excess].some(
      ([itemId, rate]) => rate.compare(declared.get(itemId) ?? ZERO) !== 0,
    )
  )
    throw new Error('Production surplus does not match remaining outputs');
  return { transfers, targets, surplus, imports };
}
