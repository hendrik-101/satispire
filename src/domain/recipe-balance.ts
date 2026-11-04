import type { CatalogRecipe } from './catalog.js';
import { Rational } from './rational.js';

const ZERO = Rational.parse('0');
const ONE = Rational.parse('1');
const NEGATIVE_ONE = Rational.parse('-1');
// Bound both memory and work independently of the catalog's entry bounds.
export const BALANCE_CELL_LIMIT = 1_000_000;
export const BALANCE_PIVOT_LIMIT = 10_000;
export const BALANCE_WORK_LIMIT = 250_000;

/**
 * Exact minimum total crafts for a fixed set of selected recipes. Each nonraw
 * item has production - consumption >= target demand. All outputs contribute;
 * excess may be discarded. No unselected recipe is introduced by this module.
 *
 * Two-phase primal simplex starts with artificial variables. Bland's entering
 * and leaving rules make degenerate solutions deterministic and prevent cycling.
 */
export function balanceSelectedRecipes(
  recipes: CatalogRecipe[],
  targets: ReadonlyMap<string, Rational>,
  rawItems: ReadonlySet<string>,
): Map<string, Rational> {
  let work = 0;
  function charge(units: number): void {
    work += units;
    if (work > BALANCE_WORK_LIMIT)
      throw new Error(
        `Coproduct balance exceeds the ${BALANCE_WORK_LIMIT}-unit work bound`,
      );
  }
  // Long exact fractions cost more than small integer arithmetic. Cache a
  // conservative digit-based weight so large denominators exhaust work sooner.
  const weights = new WeakMap<Rational, number>();
  function weight(value: Rational): number {
    let result = weights.get(value);
    if (result === undefined) {
      result = Math.ceil(value.toString().length / 32);
      weights.set(value, result);
    }
    return result;
  }
  function arithmetic(left: Rational, right: Rational, operations = 1): void {
    charge(operations * weight(left) * weight(right));
  }
  const ordered = [...recipes].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const emptyRow = () => {
    charge(ordered.length);
    return ordered.map(() => ZERO);
  };
  const coefficients = new Map<string, Rational[]>();
  for (const itemId of targets.keys()) {
    if (!rawItems.has(itemId)) coefficients.set(itemId, emptyRow());
  }
  for (const [column, recipe] of ordered.entries()) {
    for (const [parts, sign] of [
      [recipe.outputs, ONE],
      [recipe.inputs, NEGATIVE_ONE],
    ] as const) {
      for (const part of parts) {
        if (rawItems.has(part.itemId)) continue;
        let row = coefficients.get(part.itemId);
        if (!row) {
          row = emptyRow();
          coefficients.set(part.itemId, row);
        }
        const quantity = Rational.parseCanonical(part.quantity);
        arithmetic(quantity, row[column]!, 2);
        row[column] = row[column]!.add(quantity.multiply(sign));
      }
    }
  }
  const constraints = [...coefficients.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    // These inequalities hold for every nonnegative execution vector.
    .filter(
      ([id, row]) =>
        (targets.get(id) ?? ZERO).compare(ZERO) > 0 ||
        row.some((value) => value.compare(ZERO) < 0),
    );
  const n = ordered.length;
  const m = constraints.length;
  const width = n + 2 * m;
  if (m * (width + 1) > BALANCE_CELL_LIMIT)
    throw new Error(
      `Coproduct balance exceeds the ${BALANCE_CELL_LIMIT}-cell bound`,
    );
  charge(m * (width + 1));
  // A*x - surplus + artificial = demand. Each row's last entry is RHS.
  const rows = constraints.map(([itemId, values], rowIndex) => [
    ...values,
    ...Array.from({ length: m }, (_, i) =>
      i === rowIndex ? NEGATIVE_ONE : ZERO,
    ),
    ...Array.from({ length: m }, (_, i) => (i === rowIndex ? ONE : ZERO)),
    targets.get(itemId) ?? ZERO,
  ]);
  const basis = constraints.map((_, i) => n + m + i);
  let pivots = 0;

  function pivot(rowIndex: number, column: number): void {
    if (++pivots > BALANCE_PIVOT_LIMIT)
      throw new Error(
        `Coproduct balance exceeds the ${BALANCE_PIVOT_LIMIT}-pivot bound`,
      );
    const row = rows[rowIndex]!;
    const divisor = row[column]!;
    for (let j = 0; j <= width; j++) {
      charge(1);
      if (row[j]!.compare(ZERO) === 0) continue;
      arithmetic(row[j]!, divisor);
      row[j] = row[j]!.divide(divisor);
    }
    for (let i = 0; i < rows.length; i++) {
      if (i === rowIndex) continue;
      charge(1);
      const other = rows[i]!;
      const factor = other[column]!;
      if (factor.compare(ZERO) === 0) continue;
      for (let j = 0; j <= width; j++) {
        charge(1);
        if (row[j]!.compare(ZERO) === 0) continue;
        arithmetic(factor, row[j]!);
        const product = factor.multiply(row[j]!);
        arithmetic(other[j]!, product);
        other[j] = other[j]!.subtract(product);
      }
    }
    basis[rowIndex] = column;
  }

  function minimize(cost: Rational[], eligibleColumns: number): void {
    for (;;) {
      const basic = new Set(basis);
      let entering = -1;
      for (let j = 0; j < eligibleColumns; j++) {
        if (basic.has(j)) continue;
        let reduced = cost[j]!;
        for (let i = 0; i < rows.length; i++) {
          charge(1);
          const basicCost = cost[basis[i]!]!;
          const coefficient = rows[i]![j]!;
          if (basicCost.compare(ZERO) === 0 || coefficient.compare(ZERO) === 0)
            continue;
          arithmetic(basicCost, coefficient);
          const product = basicCost.multiply(coefficient);
          arithmetic(reduced, product);
          reduced = reduced.subtract(product);
        }
        if (reduced.compare(ZERO) < 0) {
          entering = j;
          break;
        }
      }
      if (entering < 0) return;
      let leaving = -1;
      let smallest: Rational | undefined;
      for (let i = 0; i < rows.length; i++) {
        const coefficient = rows[i]![entering]!;
        if (coefficient.compare(ZERO) <= 0) continue;
        arithmetic(rows[i]![width]!, coefficient);
        const ratio = rows[i]![width]!.divide(coefficient);
        if (
          smallest === undefined ||
          ratio.compare(smallest) < 0 ||
          (ratio.compare(smallest) === 0 && basis[i]! < basis[leaving]!)
        ) {
          leaving = i;
          smallest = ratio;
        }
      }
      if (leaving < 0)
        throw new Error('Selected recipe balance has an unbounded objective');
      pivot(leaving, entering);
    }
  }

  const phaseOne = Array.from({ length: width }, (_, j) =>
    j >= n + m ? ONE : ZERO,
  );
  minimize(phaseOne, width);
  let artificialTotal = ZERO;
  for (let i = 0; i < rows.length; i++)
    if (basis[i]! >= n + m)
      artificialTotal = artificialTotal.add(rows[i]![width]!);
  if (artificialTotal.compare(ZERO) !== 0)
    throw new Error(
      'Selected recipes cannot satisfy production demand: infeasible coproduct balance',
    );

  // Zero-valued artificial basics must leave before the real objective. A row
  // with no real coefficient is redundant and can simply be removed.
  for (let i = rows.length - 1; i >= 0; i--) {
    if (basis[i]! < n + m) continue;
    const column = rows[i]!.findIndex(
      (value, j) => j < n + m && value.compare(ZERO) !== 0,
    );
    if (column >= 0) pivot(i, column);
    else {
      rows.splice(i, 1);
      basis.splice(i, 1);
    }
  }
  const phaseTwo = Array.from({ length: width }, (_, j) =>
    j < n ? ONE : ZERO,
  );
  minimize(phaseTwo, n + m);
  const result = new Map(ordered.map((recipe) => [recipe.id, ZERO]));
  for (let i = 0; i < rows.length; i++) {
    if (basis[i]! < n) result.set(ordered[basis[i]!]!.id, rows[i]![width]!);
  }
  return result;
}
