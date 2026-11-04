import { expect, it } from 'vitest';
import type { CatalogRecipe } from '../src/domain/catalog.js';
import { balanceSelectedRecipes } from '../src/domain/recipe-balance.js';
import { Rational } from '../src/domain/rational.js';

function recipe(
  id: string,
  inputs: Record<string, string>,
  outputs: Record<string, string>,
): CatalogRecipe {
  const parts = (values: Record<string, string>) =>
    Object.entries(values).map(([itemId, quantity]) => ({ itemId, quantity }));
  return {
    id,
    name: id,
    machineId: 'machine',
    durationSeconds: '60',
    inputs: parts(inputs),
    outputs: parts(outputs),
  };
}
const demands = (values: Record<string, string>) =>
  new Map(
    Object.entries(values).map(([id, value]) => [id, Rational.parse(value)]),
  );
const raw = new Set(['ore']);

it('finds the minimum total crafts when extra coproduct supply has unequal yields', () => {
  const result = balanceSelectedRecipes(
    [
      recipe('split', { ore: '1' }, { a: '1', b: '1' }),
      recipe('second', { ore: '1' }, { d: '1', b: '2' }),
    ],
    demands({ a: '1', d: '1', b: '5' }),
    raw,
  );
  expect([...result].map(([id, value]) => [id, value.toString()])).toEqual([
    ['second', '2'],
    ['split', '1'],
  ]);
});

it('handles exact degenerate and redundant constraints deterministically', () => {
  const recipes = [
    recipe('one', { ore: '1' }, { a: '1', b: '1' }),
    recipe('two', { ore: '1' }, { a: '1', b: '1' }),
  ];
  const expected = balanceSelectedRecipes(
    recipes,
    demands({ a: '1/3', b: '1/3' }),
    raw,
  );
  expect([...expected].map(([id, value]) => [id, value.toString()])).toEqual([
    ['one', '1/3'],
    ['two', '0'],
  ]);
  expect(
    balanceSelectedRecipes(
      [...recipes].reverse(),
      demands({ b: '1/3', a: '1/3' }),
      raw,
    ),
  ).toEqual(expected);
});

it('rejects infeasible balances rather than emitting negative execution', () => {
  const recipes = [recipe('loss', { a: '2' }, { a: '1', b: '1' })];
  expect(() =>
    balanceSelectedRecipes(recipes, demands({ b: '1' }), raw),
  ).toThrow(/infeasible/i);
  expect(() =>
    balanceSelectedRecipes([], demands({ missing: '1' }), raw),
  ).toThrow(/infeasible/i);
});

it('rejects dense rational solves at the deterministic cumulative work bound', () => {
  const count = 64;
  const recipes = Array.from({ length: count }, (_, index) =>
    recipe(
      `recipe${String(index).padStart(3, '0')}`,
      { ore: '1' },
      Object.fromEntries(
        Array.from({ length: count }, (_, offset) => [
          `item${String((index + offset) % count).padStart(3, '0')}`,
          offset === 0 ? '1' : '1/1000',
        ]),
      ),
    ),
  );
  const targets = demands(
    Object.fromEntries(
      Array.from({ length: count }, (_, index) => [
        `item${String(index).padStart(3, '0')}`,
        '1',
      ]),
    ),
  );
  expect(() => balanceSelectedRecipes(recipes, targets, raw)).toThrow(
    /work bound/i,
  );
});
