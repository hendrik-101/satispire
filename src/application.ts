import { variantSchema } from './domain/build-variants.js';
import { generateSupplyLayout } from './domain/supply-layout.js';
import { z } from 'zod';
import { type Catalog, validateCatalog } from './domain/catalog.js';
import { solveProduction } from './domain/production.js';
import { generateFloors } from './domain/geometry.js';
import {
  authorizeRoom,
  applyRoomCommand,
  readRoom,
  type RoomState,
  type RoomContext,
  RoomError,
} from './domain/rooms.js';
import {
  type ToolExecutor,
  type ToolName,
  type ToolResult,
} from './adapters/webmcp.js';
import {
  identity,
  productionSchema,
  floorsSchema,
  commandSchema,
} from './inputs.js';

/** Local single-process adapter. It is not persistent or an online room service. */
export function createLocalApplication(
  initial: RoomState,
  context: RoomContext,
  inputCatalog: Catalog,
  onRoomChange?: (room: RoomState) => void,
): { execute: ToolExecutor } {
  let room = structuredClone(initial);
  const principal = structuredClone(context);
  const catalog = validateCatalog(inputCatalog);
  const execute = async (name: ToolName, raw: unknown): Promise<ToolResult> => {
    try {
      // Check binding before parsing detailed arguments; cross-room failures disclose no state.
      if (
        typeof raw !== 'object' ||
        raw === null ||
        !('roomId' in raw) ||
        raw.roomId !== principal.roomId
      )
        throw new RoomError('forbidden');
      authorizeRoom(room, principal);
      if (name === 'read_room') {
        z.object({ roomId: identity }).strict().parse(raw);
        return { ok: true, data: readRoom(room, principal) };
      }
      if (name === 'apply_command') {
        const args = z
          .object({ roomId: identity, command: commandSchema })
          .strict()
          .parse(raw);
        const result = applyRoomCommand(room, principal, args.command);
        // No awaits between reading revision and replacing state.
        room = result.room;
        if (!result.duplicate) onRoomChange?.(structuredClone(room));
        return {
          ok: true,
          data: { revision: result.revision, duplicate: result.duplicate },
        };
      }
      if (name === 'solve_production') {
        const args = z
          .object({ roomId: identity, input: productionSchema })
          .strict()
          .parse(raw);
        return {
          ok: true,
          data: solveProduction(catalog, {
            ...args.input,
            ...(room.unlocks ? { technology: room.unlocks.technology } : {}),
          }),
        };
      }
      if (name === 'plan_factory') {
        const args = z
          .object({
            roomId: identity,
            input: z
              .object({
                production: productionSchema,
                rows: z.number().int().min(0).max(64).default(0),
                variant: variantSchema.optional(),
              })
              .strict(),
          })
          .strict()
          .parse(raw);
        const input = {
          ...args.input.production,
          ...(room.unlocks ? { technology: room.unlocks.technology } : {}),
        };
        if (!input.technology)
          throw new Error(
            'Factory planning requires an explicit technology profile',
          );
        const production = solveProduction(catalog, input);
        const layout = generateSupplyLayout(
          catalog,
          production,
          input.technology,
          args.input.rows,
          args.input.variant,
        );
        return { ok: true, data: { production, layout } };
      }
      if (name === 'generate_floors') {
        const args = z
          .object({ roomId: identity, input: floorsSchema })
          .strict()
          .parse(raw);
        const input = args.input;
        const floors = {
          footprint: input.footprint,
          floorCount: input.floorCount,
          floorHeight: input.floorHeight,
          blocks: input.blocks.map((b) => ({
            id: b.id,
            floor: b.floor,
            count: b.count,
            rows: b.rows,
            ...(b.rotation === undefined ? {} : { rotation: b.rotation }),
            ...(b.position === undefined ? {} : { position: b.position }),
          })),
          ...(input.connections === undefined
            ? {}
            : { connections: input.connections }),
          ...(input.maxHeight === undefined
            ? {}
            : { maxHeight: input.maxHeight }),
          ...(input.maxMachinesPerFloor === undefined
            ? {}
            : { maxMachinesPerFloor: input.maxMachinesPerFloor }),
        };
        return { ok: true, data: generateFloors(floors) };
      }
      return {
        ok: false,
        error: { code: 'unknown-tool', message: 'Unknown tool' },
      };
    } catch (error) {
      if (error instanceof RoomError)
        return {
          ok: false,
          error: { code: error.code, message: error.message },
        };
      if (error instanceof z.ZodError)
        return {
          ok: false,
          error: { code: 'invalid-input', message: 'Invalid tool arguments' },
        };
      return {
        ok: false,
        error: {
          code: 'planner-error',
          message: error instanceof Error ? error.message : 'Planning failed',
        },
      };
    }
  };
  return { execute };
}
