import { expect, test } from 'vitest';
import { commandSchema, productionSchema } from '../src/inputs';

const request = () => ({
  targets: [{ itemId: 'example:plate', rate: '1' }],
  recipes: { 'example:plate': 'example:press' },
  imports: ['example:ore'],
});

test('recipe count errors do not reflect an attacker-controlled oversized key', () => {
  const recipes = Object.fromEntries(
    Array.from({ length: 2000 }, (_, index) => [
      `example:${index}`,
      'example:press',
    ]),
  );
  expect(productionSchema.safeParse({ ...request(), recipes }).success).toBe(
    true,
  );
  recipes['x'.repeat(10000)] = 'example:press';
  const result = productionSchema.safeParse({ ...request(), recipes });
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.error.issues.map((issue) => issue.path)).toEqual([
      ['recipes'],
    ]);
});

test('recipe map preflight rejects 2001 enumerable keys without reading values', () => {
  const recipes = Object.fromEntries(
    Array.from({ length: 2001 }, (_, index) => [
      `example:${index}`,
      'example:press',
    ]),
  );
  Object.defineProperty(recipes, 'example:0', {
    enumerable: true,
    get: () => {
      throw new Error('Recipe values must not be read before size rejection');
    },
  });
  expect(productionSchema.safeParse({ ...request(), recipes }).success).toBe(
    false,
  );
});

test('recipe map preflight counts inherited enumerable keys matching the record parser', () => {
  const prototype = Object.fromEntries(
    Array.from({ length: 2001 }, (_, index) => [
      `example:${index}`,
      'example:press',
    ]),
  );
  Object.defineProperty(prototype, 'example:0', {
    enumerable: true,
    get: () => {
      throw new Error(
        'Inherited recipe values must not be read before size rejection',
      );
    },
  });
  expect(
    productionSchema.safeParse({
      ...request(),
      recipes: Object.create(prototype) as object,
    }).success,
  ).toBe(false);
});

test.each(['targets', 'imports'] as const)(
  '%s preflight rejects 2001 entries before parsing entries',
  (field) => {
    const entries = Array.from({ length: 2001 }, () =>
      field === 'targets'
        ? { itemId: 'example:plate', rate: '1' }
        : 'example:ore',
    );
    Object.defineProperty(entries, '0', {
      get: () => {
        throw new Error('Array entries must not be read before size rejection');
      },
    });
    expect(
      productionSchema.safeParse({ ...request(), [field]: entries }).success,
    ).toBe(false);
  },
);

test('set-target uses catalog IDs while room commands and block IDs retain 128-character bounds', () => {
  const itemId = 'example:item/' + 'x'.repeat(243);
  expect(itemId).toHaveLength(256);
  const command = {
    id: 'command',
    expectedRevision: 0,
    command: { type: 'set-target', itemId, rate: '1' },
  };
  expect(commandSchema.safeParse(command).success).toBe(true);
  expect(
    commandSchema.safeParse({
      ...command,
      command: { ...command.command, itemId: itemId + 'x' },
    }).success,
  ).toBe(false);
  expect(
    commandSchema.safeParse({ ...command, id: 'x'.repeat(129) }).success,
  ).toBe(false);
  expect(
    commandSchema.safeParse({
      ...command,
      command: { type: 'set-block-rows', blockId: 'x'.repeat(129), rows: 1 },
    }).success,
  ).toBe(false);
});
