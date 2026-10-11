import { z } from 'zod';
export const identity = z.string().min(1).max(128);
export const productionSchema = z
  .object({
    targets: z
      .array(
        z
          .object({ itemId: identity, rate: z.string().min(1).max(256) })
          .strict(),
      )
      .min(1)
      .max(256),
    recipes: z.record(identity, identity),
    imports: z.array(identity).max(1024),
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
          type: z.literal('set-target'),
          itemId: identity,
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
