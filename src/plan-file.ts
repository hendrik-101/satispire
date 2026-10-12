import { z } from 'zod';
import { productionSchema } from './inputs.js';
import { defaultBuildVariant, variantSchema } from './domain/build-variants.js';
export const planLayoutSchema = z
  .object({
    rows: z.number().int().min(0).max(64).default(0),
    variant: variantSchema.default(defaultBuildVariant),
  })
  .strict();
export const planFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    catalogVersion: z.string().min(1).max(256),
    production: productionSchema,
    layout: planLayoutSchema.default({ rows: 0, variant: defaultBuildVariant }),
  })
  .strict();
