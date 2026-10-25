import {
  actionGeneric,
  internalMutationGeneric,
  mutationGeneric,
  queryGeneric,
  makeFunctionReference,
  paginationOptsValidator,
  type GenericMutationCtx,
  type DataModelFromSchemaDefinition,
} from 'convex/server';
import { v } from 'convex/values';
import schema from './schema';
import { hashSecret, randomSecret, verified } from './rooms';
import { authorizeRoom, RoomError, type RoomState } from '../src/domain/rooms';
import {
  canonical,
  diffPlan,
  reversePlan,
  validateSharedPlan,
  type SharedPlan,
  type PlanChange,
} from '../src/domain/shared-plan';
import type { Membership, HistoryEntry } from '../src/room-api';

type Ctx = GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>>;
const authArgs = { roomId: v.string(), capability: v.string() };
const editArgs = { ...authArgs, id: v.string(), expectedRevision: v.number() };
const createRoomRef = makeFunctionReference<
  'action',
  { name: string; unlocks: SharedPlan['unlocks'] },
  Membership
>('rooms:create');
const initializeRef = makeFunctionReference<
  'mutation',
  { roomId: string; capability: string; plan: string; digest: string },
  null
>('plans:initialize');
const redeemRef = makeFunctionReference<
  'mutation',
  {
    roomId: string;
    digest: string;
    name: string;
    participantId: string;
    capabilityDigest: string;
  },
  null
>('plans:redeem');
function boundedPlan(raw: unknown) {
  if (new TextEncoder().encode(JSON.stringify(raw)).length > 180_000)
    throw new Error('plan-too-large');
  return validateSharedPlan(raw);
}
export const create = actionGeneric({
  args: { name: v.string(), plan: v.any() },
  handler: async (ctx, args): Promise<Membership & { shareSecret: string }> => {
    const plan = boundedPlan(args.plan);
    const owner = await ctx.runAction(createRoomRef, {
      name: args.name,
      unlocks: plan.unlocks,
    });
    const shareSecret = randomSecret();
    await ctx.runMutation(initializeRef, {
      roomId: owner.roomId,
      capability: owner.capability,
      plan: JSON.stringify(plan),
      digest: await hashSecret(shareSecret),
    });
    return { ...owner, shareSecret };
  },
});
export const initialize = internalMutationGeneric({
  args: { ...authArgs, plan: v.string(), digest: v.string() },
  handler: async (ctx, args) => {
    const { room, context } = await verified(ctx, args.roomId, args.capability);
    authorizeRoom(room.state, context, 'owner');
    const exists = await ctx.db
      .query('plans')
      .withIndex('by_room', (q) => q.eq('roomId', args.roomId))
      .unique();
    if (exists) throw new Error('plan-already-initialized');
    const plan = boundedPlan(JSON.parse(args.plan));
    await ctx.db.insert('plans', {
      roomId: args.roomId,
      plan: JSON.stringify(plan),
    });
    await ctx.db.insert('roomLinks', {
      roomId: args.roomId,
      digest: args.digest,
    });
    return null;
  },
});
export const join = actionGeneric({
  args: { roomId: v.string(), shareSecret: v.string(), name: v.string() },
  handler: async (ctx, args): Promise<Membership> => {
    const capability = randomSecret(),
      participantId = crypto.randomUUID();
    await ctx.runMutation(redeemRef, {
      roomId: args.roomId,
      digest: await hashSecret(args.shareSecret),
      name: args.name,
      participantId,
      capabilityDigest: await hashSecret(capability),
    });
    return { roomId: args.roomId, participantId, capability };
  },
});
export const redeem = internalMutationGeneric({
  args: {
    roomId: v.string(),
    digest: v.string(),
    name: v.string(),
    participantId: v.string(),
    capabilityDigest: v.string(),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query('roomLinks')
      .withIndex('by_room', (q) => q.eq('roomId', args.roomId))
      .unique();
    if (!link || link.digest !== args.digest) throw new RoomError('forbidden');
    if (!args.name.trim() || args.name.trim().length > 80)
      throw new RoomError('invalid-participant');
    const room = await ctx.db
      .query('rooms')
      .withIndex('by_room', (q) => q.eq('roomId', args.roomId))
      .unique();
    if (!room) throw new RoomError('forbidden');
    const state = room.state as RoomState;
    const owner = Object.values(state.participants).find(
      (p) => p.role === 'owner',
    )!;
    state.participants[args.participantId] = {
      ...structuredClone(owner),
      id: args.participantId,
      name: args.name.trim(),
      role: 'editor',
      presence: {
        view: 'layout',
        floor: 0,
        cursor: null,
        following: false,
        previous: null,
      },
    };
    await ctx.db.patch(room._id, { state });
    await ctx.db.insert('capabilities', {
      digest: args.capabilityDigest,
      roomId: args.roomId,
      participantId: args.participantId,
    });
    return null;
  },
});
export const view = queryGeneric({
  args: authArgs,
  handler: async (ctx, args) => {
    const { room } = await verified(ctx, args.roomId, args.capability);
    const record = await ctx.db
      .query('plans')
      .withIndex('by_room', (q) => q.eq('roomId', args.roomId))
      .unique();
    if (!record) throw new Error('plan-not-initialized');
    return {
      plan: JSON.parse(record.plan) as SharedPlan,
      revision: room.state.revision,
    };
  },
});
const fieldNames: Record<PlanChange['field'], string> = {
  targets: 'Outputs',
  recipes: 'Rezepte',
  imports: 'Inputs',
  unlocks: 'Freischaltungen',
  rows: 'Reihen',
  variant: 'Layout',
};
async function commit(
  ctx: Ctx,
  args: {
    roomId: string;
    capability: string;
    id: string;
    expectedRevision: number;
  },
  payload: { plan?: unknown; entryId?: string },
) {
  const { room, context } = await verified(ctx, args.roomId, args.capability);
  const actor = authorizeRoom(room.state, context, 'edit');
  if (
    !/^[A-Za-z0-9._:-]{1,128}$/.test(args.id) ||
    !Number.isSafeInteger(args.expectedRevision) ||
    args.expectedRevision < 0
  )
    throw new RoomError('invalid-command');
  const raw = canonical({
    expectedRevision: args.expectedRevision,
    ...payload,
  });
  // Bound client-controlled hashing/receipt work before any persistence.
  if (raw.length > 200_000) throw new Error('plan-too-large');
  const fingerprint = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  const receipt = await ctx.db
    .query('planReceipts')
    .withIndex('by_room_command', (q) =>
      q.eq('roomId', args.roomId).eq('commandId', args.id),
    )
    .unique();
  if (receipt) {
    if (
      receipt.participantId !== actor.id ||
      receipt.fingerprint !== fingerprint
    )
      throw new RoomError('command-id-reused');
    return { revision: receipt.revision, duplicate: true };
  }
  if (room.state.revision !== args.expectedRevision)
    throw new RoomError('revision-conflict');
  const record = await ctx.db
    .query('plans')
    .withIndex('by_room', (q) => q.eq('roomId', args.roomId))
    .unique();
  if (!record) throw new Error('plan-not-initialized');
  const before = JSON.parse(record.plan) as SharedPlan;
  let after: SharedPlan;
  if (payload.entryId) {
    const id = ctx.db.normalizeId('planHistory', payload.entryId);
    const entry = id ? await ctx.db.get('planHistory', id) : null;
    if (!entry || entry.roomId !== args.roomId)
      throw new RoomError('forbidden');
    after = reversePlan(before, entry.changes);
  } else after = boundedPlan(payload.plan);
  const changes = diffPlan(before, after);
  const revision = room.state.revision + (changes.length ? 1 : 0);
  if (changes.length) {
    await ctx.db.patch(record._id, { plan: JSON.stringify(after) });
    await ctx.db.patch(room._id, {
      state: { ...room.state, revision, unlocks: after.unlocks },
    });
    await ctx.db.insert('planHistory', {
      roomId: args.roomId,
      revision,
      participantId: actor.id,
      author: actor.name,
      timestamp: Date.now(),
      summary:
        (payload.entryId ? 'Rückgängig: ' : '') +
        changes.map((c) => fieldNames[c.field]).join(', '),
      changes,
      undoOf: payload.entryId ?? null,
    });
  }
  await ctx.db.insert('planReceipts', {
    roomId: args.roomId,
    commandId: args.id,
    participantId: actor.id,
    fingerprint,
    revision,
  });
  return { revision, duplicate: false };
}
export const edit = mutationGeneric({
  args: { ...editArgs, plan: v.any() },
  handler: (ctx, args) => commit(ctx, args, { plan: args.plan }),
});
export const undo = mutationGeneric({
  args: { ...editArgs, entryId: v.string() },
  handler: (ctx, args) => commit(ctx, args, { entryId: args.entryId }),
});
export const history = queryGeneric({
  args: { ...authArgs, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await verified(ctx, args.roomId, args.capability);
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50)
      throw new Error('invalid-page-size');
    const result = await ctx.db
      .query('planHistory')
      .withIndex('by_room_revision', (q) => q.eq('roomId', args.roomId))
      .order('desc')
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map(
        (entry): HistoryEntry => ({
          id: entry._id,
          revision: entry.revision,
          participantId: entry.participantId,
          author: entry.author,
          timestamp: entry.timestamp,
          summary: entry.summary,
          changes: entry.changes,
          undoOf: entry.undoOf,
        }),
      ),
    };
  },
});
