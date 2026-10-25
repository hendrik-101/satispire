import type { z } from 'zod';
import { planFileSchema } from './plan-file.js';
import { vanillaCatalog } from './domain/vanilla.js';
import { solveProduction } from './domain/production.js';
import { generateSupplyLayout } from './domain/supply-layout.js';
import {
  createUnlockProfile,
  validateUnlockProfile,
} from './domain/session-unlocks.js';
export type SessionPlan = z.infer<typeof planFileSchema>;
export interface SessionMembership {
  sessionId: string;
  participantId: string;
  capability: string;
}
export interface SessionSnapshot {
  revision: number;
  plan: SessionPlan;
}
export interface SessionPresenceInput {
  view: 'production' | 'layout';
  floor: string;
  cursor: { x: number; y: number } | null;
}
export interface SessionPresence extends SessionPresenceInput {
  participantId: string;
  clientId: string;
  name: string;
  color: string;
  updatedAt: number;
}
export function validateSessionPlan(value: unknown): SessionPlan {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 262144)
    throw new Error('plan-too-large');
  const plan = planFileSchema.parse(value);
  if (plan.unlocks !== undefined) validateUnlockProfile(plan.unlocks);
  if (plan.catalogVersion !== vanillaCatalog.catalogVersion)
    throw new Error('catalog-mismatch');
  const technology =
    plan.production.technology ??
    plan.unlocks?.technology ??
    createUnlockProfile().technology;
  const solved = solveProduction(vanillaCatalog, {
    ...plan.production,
    technology,
  });
  generateSupplyLayout(
    vanillaCatalog,
    solved,
    technology,
    plan.layout.rows,
    plan.layout.variant,
  );
  return plan;
}
