import { z } from 'zod';
import { planFileSchema } from '../plan-file.js';
import {
  createUnlockProfile,
  validateUnlockProfile,
} from './session-unlocks.js';
import { availableChoices, vanillaCatalog } from './vanilla.js';
import { solveProduction } from './production.js';
import { generateSupplyLayout } from './supply-layout.js';
import { defaultBuildVariant } from './build-variants.js';

export const sharedPlanSchema = planFileSchema.extend({
  unlocks: planFileSchema.shape.unlocks.unwrap(),
});
export type SharedPlan = z.infer<typeof sharedPlanSchema>;
/** Stable JSON equality also ignores object insertion order from different clients. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function validateSharedPlan(input: unknown): SharedPlan {
  const plan = sharedPlanSchema.parse(input);
  if (plan.catalogVersion !== vanillaCatalog.catalogVersion)
    throw new Error('catalog-mismatch');
  validateUnlockProfile(plan.unlocks);
  if (
    plan.production.technology &&
    canonical(plan.production.technology) !== canonical(plan.unlocks.technology)
  )
    throw new Error('unlock-technology-mismatch');
  plan.production.technology = plan.unlocks.technology;
  const solved = solveProduction(vanillaCatalog, plan.production);
  generateSupplyLayout(
    vanillaCatalog,
    solved,
    plan.unlocks.technology,
    plan.layout.rows,
    plan.layout.variant,
  );
  return plan;
}
export function initialSharedPlan(): SharedPlan {
  const unlocks = createUnlockProfile();
  return validateSharedPlan({
    schemaVersion: 1,
    catalogVersion: vanillaCatalog.catalogVersion,
    unlocks,
    production: {
      targets: [{ itemId: 'Desc_IronPlate_C', rate: '20' }],
      recipes: availableChoices(unlocks.technology),
      imports: vanillaCatalog.items.filter((i) => i.raw).map((i) => i.id),
      technology: unlocks.technology,
    },
    layout: { rows: 0, variant: defaultBuildVariant },
  });
}
const fields = [
  'targets',
  'recipes',
  'imports',
  'unlocks',
  'rows',
  'variant',
] as const;
export type PlanField = (typeof fields)[number];
export interface PlanChange {
  field: PlanField;
  before: string;
  after: string;
}
function read(plan: SharedPlan, field: PlanField): unknown {
  if (field === 'unlocks') return plan.unlocks;
  if (field === 'rows' || field === 'variant') return plan.layout[field];
  return plan.production[field];
}
function write(plan: SharedPlan, field: PlanField, value: unknown) {
  if (field === 'unlocks') {
    plan.unlocks = value as SharedPlan['unlocks'];
    plan.production.technology = plan.unlocks.technology;
  } else if (field === 'rows' || field === 'variant')
    Object.assign(plan.layout, { [field]: value });
  else Object.assign(plan.production, { [field]: value });
}
export function diffPlan(before: SharedPlan, after: SharedPlan): PlanChange[] {
  return fields.flatMap((field) => {
    const a = canonical(read(before, field)),
      b = canonical(read(after, field));
    return a === b ? [] : [{ field, before: a, after: b }];
  });
}
export function reversePlan(
  current: SharedPlan,
  changes: PlanChange[],
): SharedPlan {
  const next = structuredClone(current);
  for (const change of changes) {
    if (
      !fields.includes(change.field) ||
      canonical(read(current, change.field)) !== change.after
    )
      throw new Error('undo-conflict');
    write(next, change.field, JSON.parse(change.before));
  }
  try {
    return validateSharedPlan(next);
  } catch {
    throw new Error('undo-conflict');
  }
}
