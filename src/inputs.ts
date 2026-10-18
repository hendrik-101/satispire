import { technologySchema } from './domain/technology.js';
import { unlockProfileSchema } from './domain/session-unlocks.js';
import { z } from 'zod';
import { CATALOG_ID_LIMIT, CATALOG_ID_PATTERN } from './domain/catalog.js';
import { INPUT_ENTRY_LIMIT } from './domain/production.js';
export const identity = z.string().min(1).max(128);
export const catalogIdentity = z
  .string()
  .min(1)
  .max(CATALOG_ID_LIMIT)
  .regex(CATALOG_ID_PATTERN);

const arrayPreflight = z.unknown().superRefine((value, context) => {
  if (Array.isArray(value) && value.length > INPUT_ENTRY_LIMIT) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Production collection exceeds the ${INPUT_ENTRY_LIMIT}-entry limit`,
    });
  }
});
const recipePreflight = z.unknown().superRefine((value, context) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return;
  let count = 0;
  // Match Zod's record iteration, including inherited enumerable keys, without
  // reading any entry value or allocating a second array of every key.
  for (const key in value) {
    void key;
    if (++count > INPUT_ENTRY_LIMIT) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Recipes exceed the ${INPUT_ENTRY_LIMIT}-entry limit`,
      });
      return;
    }
  }
});
export const productionSchema = z
  .object({
    technology: technologySchema.optional(),
    targets: arrayPreflight.pipe(
      z
        .array(
          z
            .object({
              itemId: catalogIdentity,
              rate: z.string().min(1).max(256),
            })
            .strict(),
        )
        .min(1)
        .max(INPUT_ENTRY_LIMIT),
    ),
    recipes: recipePreflight.pipe(z.record(catalogIdentity, catalogIdentity)),
    imports: arrayPreflight.pipe(
      z.array(catalogIdentity).max(INPUT_ENTRY_LIMIT),
    ),
  })
  .strict();
const blockSchema = z
  .object({
    id: identity,
    floor: z.number().int().min(0).max(255),
    count: z.number().int().min(1).max(4096),
    rows: z.number().int().min(1).max(256),
    rotation: z
      .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
      .optional(),
    position: z
      .object({ x: z.number().int(), y: z.number().int() })
      .strict()
      .optional(),
  })
  .strict();
export const floorsSchema = z
  .object({
    footprint: z
      .object({
        width: z.number().int().positive(),
        depth: z.number().int().positive(),
      })
      .strict(),
    floorCount: z.number().int().min(1).max(256),
    floorHeight: z.number().int().positive(),
    blocks: z.array(blockSchema).min(1).max(256),
    connections: z
      .array(
        z
          .object({ id: identity, fromBlock: identity, toBlock: identity })
          .strict(),
      )
      .max(256)
      .optional(),
    maxHeight: z.number().int().positive().optional(),
    maxMachinesPerFloor: z.number().int().positive().optional(),
  })
  .strict();
export const commandSchema = z
  .object({
    id: identity,
    expectedRevision: z.number().int().nonnegative(),
    command: z.discriminatedUnion('type', [
      z
        .object({
          type: z.literal('set-unlocks'),
          profile: unlockProfileSchema,
        })
        .strict(),
      z
        .object({
          type: z.literal('set-target'),
          itemId: catalogIdentity,
          rate: z.string().min(1).max(256),
        })
        .strict(),
      z
        .object({
          type: z.literal('set-block-rows'),
          blockId: identity,
          rows: z.number().int().min(1).max(256),
        })
        .strict(),
    ]),
  })
  .strict();
