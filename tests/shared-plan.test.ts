import { expect, it } from 'vitest';
import {
  validateSharedPlan,
  diffPlan,
  reversePlan,
  initialSharedPlan,
} from '../src/domain/shared-plan';
import { createUnlockProfile } from '../src/domain/session-unlocks';

it('preserves the complete validated plan and reverses only the affected fields', () => {
  const before = initialSharedPlan();
  const after = validateSharedPlan({
    ...before,
    layout: { ...before.layout, rows: 2 },
  });
  const later = validateSharedPlan({
    ...after,
    production: {
      ...after.production,
      targets: [{ itemId: 'Desc_IronPlate_C', rate: '40' }],
    },
  });
  const undone = reversePlan(later, diffPlan(before, after));
  expect(undone.layout.rows).toBe(0);
  expect(undone.production.targets).toEqual([
    { itemId: 'Desc_IronPlate_C', rate: '40' },
  ]);
  expect(undone.unlocks).toEqual(createUnlockProfile());
  expect(undone.production.imports).toEqual(before.production.imports);
  expect(undone.production.recipes).toEqual(before.production.recipes);
});
it('rejects overlapping undo instead of overwriting a newer edit', () => {
  const before = initialSharedPlan();
  const after = validateSharedPlan({
    ...before,
    layout: { ...before.layout, rows: 2 },
  });
  const later = validateSharedPlan({
    ...after,
    layout: { ...after.layout, rows: 4 },
  });
  expect(() => reversePlan(later, diffPlan(before, after))).toThrow(
    'undo-conflict',
  );
  expect(later.layout.rows).toBe(4);
});
it('treats target changes atomically and supports undoing an undo', () => {
  const before = initialSharedPlan();
  const after = validateSharedPlan({
    ...before,
    production: {
      ...before.production,
      targets: [{ itemId: 'Desc_IronPlate_C', rate: '40' }],
    },
  });
  const undone = reversePlan(after, diffPlan(before, after));
  expect(undone).toEqual(before);
  expect(reversePlan(undone, diffPlan(after, undone))).toEqual(after);
});
it('rejects invalid production, catalog mismatches and divergent unlock technology', () => {
  const before = initialSharedPlan();
  expect(() =>
    validateSharedPlan({ ...before, catalogVersion: 'other' }),
  ).toThrow();
  expect(() =>
    validateSharedPlan({
      ...before,
      production: {
        ...before.production,
        targets: [{ itemId: 'unknown', rate: '20' }],
      },
    }),
  ).toThrow();
  expect(() =>
    validateSharedPlan({ ...before, unlocks: createUnlockProfile(4) }),
  ).toThrow();
});
