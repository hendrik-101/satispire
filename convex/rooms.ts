import {
  actionGeneric,
  internalMutationGeneric,
  mutationGeneric,
  queryGeneric,
  makeFunctionReference,
  type DataModelFromSchemaDefinition,
  type GenericQueryCtx,
} from 'convex/server';
import { v } from 'convex/values';
import schema, { unlockProfileValidator } from './schema';
import {
  createUnlockProfile,
  validateUnlockProfile,
  type UnlockProfile,
} from '../src/domain/session-unlocks';
import {
  applyRoomCommand,
  createRoom,
  createInvite,
  joinRoom,
  roomView,
  RoomError,
  revokeInvite,
  setPresence,
  setPresenter,
  followPresenter,
  type RoomContext,
} from '../src/domain/rooms';

type DataModel = DataModelFromSchemaDefinition<typeof schema>;
type Membership = { roomId: string; participantId: string; capability: string };
const authArgs = { roomId: v.string(), capability: v.string() };
const invitationRole = v.union(v.literal('editor'), v.literal('viewer'));
const internalCreateRef = makeFunctionReference<
  'mutation',
  {
    roomId: string;
    participantId: string;
    name: string;
    digest: string;
    unlocks: UnlockProfile;
  },
  null
>('rooms:internalCreate');
const internalInviteRef = makeFunctionReference<
  'mutation',
  {
    roomId: string;
    capability: string;
    id: string;
    digest: string;
    role: 'editor' | 'viewer';
  },
  null
>('rooms:internalInvite');
const internalJoinRef = makeFunctionReference<
  'mutation',
  {
    roomId: string;
    digest: string;
    participantId: string;
    name: string;
    capabilityDigest: string;
  },
  null
>('rooms:internalJoin');

/** Crypto randomness lives in actions, outside deterministic mutations. */
export function randomSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function hashSecret(secret: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(secret)) throw new RoomError('forbidden');
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
async function loadRoom(ctx: GenericQueryCtx<DataModel>, roomId: string) {
  const room = await ctx.db
    .query('rooms')
    .withIndex('by_room', (q) => q.eq('roomId', roomId))
    .unique();
  if (!room) throw new RoomError('forbidden');
  return room;
}
export async function verified(
  ctx: GenericQueryCtx<DataModel>,
  roomId: string,
  capability: string,
) {
  const digest = await hashSecret(capability);
  const membership = await ctx.db
    .query('capabilities')
    .withIndex('by_digest', (q) => q.eq('digest', digest))
    .unique();
  if (!membership || membership.roomId !== roomId)
    throw new RoomError('forbidden');
  const room = await loadRoom(ctx, membership.roomId);
  const context: RoomContext = {
    roomId: membership.roomId,
    participantId: membership.participantId,
  };
  return { room, context };
}

export const create = actionGeneric({
  args: { name: v.string(), unlocks: v.optional(unlockProfileValidator) },
  handler: async (ctx, args): Promise<Membership> => {
    const roomId = crypto.randomUUID();
    const participantId = crypto.randomUUID();
    const capability = randomSecret();
    await ctx.runMutation(internalCreateRef, {
      roomId,
      participantId,
      name: args.name,
      digest: await hashSecret(capability),
      unlocks:
        args.unlocks === undefined
          ? createUnlockProfile()
          : validateUnlockProfile(args.unlocks),
    });
    return { roomId, participantId, capability };
  },
});
export const internalCreate = internalMutationGeneric({
  args: {
    roomId: v.string(),
    participantId: v.string(),
    name: v.string(),
    digest: v.string(),
    unlocks: unlockProfileValidator,
  },
  handler: async (ctx, args) => {
    const room = createRoom({
      roomId: args.roomId,
      ownerId: args.participantId,
      ownerName: args.name,
      unlocks: args.unlocks,
    });
    await ctx.db.insert('rooms', { roomId: room.id, state: room });
    await ctx.db.insert('capabilities', {
      digest: args.digest,
      roomId: room.id,
      participantId: args.participantId,
    });
    return null;
  },
});
export const invite = actionGeneric({
  args: { ...authArgs, role: invitationRole },
  handler: async (
    ctx,
    args,
  ): Promise<{ roomId: string; inviteId: string; invitation: string }> => {
    const invitation = randomSecret();
    const inviteId = crypto.randomUUID();
    await ctx.runMutation(internalInviteRef, {
      ...args,
      id: inviteId,
      digest: await hashSecret(invitation),
    });
    return { roomId: args.roomId, inviteId, invitation };
  },
});
export const internalInvite = internalMutationGeneric({
  args: {
    ...authArgs,
    id: v.string(),
    digest: v.string(),
    role: invitationRole,
  },
  handler: async (ctx, args) => {
    const { room, context } = await verified(ctx, args.roomId, args.capability);
    const state = createInvite(room.state, context, {
      id: args.id,
      digest: args.digest,
      role: args.role,
    });
    await ctx.db.patch(room._id, { state });
    return null;
  },
});
export const join = actionGeneric({
  args: { roomId: v.string(), invitation: v.string(), name: v.string() },
  handler: async (ctx, args): Promise<Membership> => {
    const participantId = crypto.randomUUID();
    const capability = randomSecret();
    await ctx.runMutation(internalJoinRef, {
      roomId: args.roomId,
      digest: await hashSecret(args.invitation),
      participantId,
      name: args.name,
      capabilityDigest: await hashSecret(capability),
    });
    return { roomId: args.roomId, participantId, capability };
  },
});
export const internalJoin = internalMutationGeneric({
  args: {
    roomId: v.string(),
    digest: v.string(),
    participantId: v.string(),
    name: v.string(),
    capabilityDigest: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await loadRoom(ctx, args.roomId);
    const state = joinRoom(room.state, args.digest, {
      id: args.participantId,
      name: args.name,
    });
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
    const { room, context } = await verified(ctx, args.roomId, args.capability);
    return roomView(room.state, context);
  },
});
export const command = mutationGeneric({
  args: {
    ...authArgs,
    id: v.string(),
    expectedRevision: v.number(),
    command: v.union(
      v.object({
        type: v.literal('set-unlocks'),
        profile: unlockProfileValidator,
      }),
      v.object({
        type: v.literal('set-target'),
        itemId: v.string(),
        rate: v.string(),
      }),
      v.object({
        type: v.literal('set-block-rows'),
        blockId: v.string(),
        rows: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { room, context } = await verified(ctx, args.roomId, args.capability);
    // Shared workspace edits must update the complete plan and history atomically.
    const shared = await ctx.db
      .query('plans')
      .withIndex('by_room', (q) => q.eq('roomId', args.roomId))
      .unique();
    if (shared) throw new Error('shared-plan-command-required');
    const result = applyRoomCommand(room.state, context, {
      id: args.id,
      expectedRevision: args.expectedRevision,
      command: args.command,
    });
    if (!result.duplicate) await ctx.db.patch(room._id, { state: result.room });
    return { revision: result.revision, duplicate: result.duplicate };
  },
});

export const revokeInvitation = mutationGeneric({
  args: { ...authArgs, inviteId: v.string() },
  handler: async (ctx, args) => {
    const { room, context } = await verified(ctx, args.roomId, args.capability);
    await ctx.db.patch(room._id, {
      state: revokeInvite(room.state, context, args.inviteId),
    });
    return null;
  },
});
export const presence = mutationGeneric({
  args: {
    ...authArgs,
    presence: v.object({
      view: v.union(v.literal('production'), v.literal('layout')),
      floor: v.number(),
      cursor: v.union(v.null(), v.object({ x: v.number(), y: v.number() })),
    }),
  },
  handler: async (ctx, args) => {
    const { room, context } = await verified(ctx, args.roomId, args.capability);
    await ctx.db.patch(room._id, {
      state: setPresence(room.state, context, args.presence),
    });
    return null;
  },
});
export const present = mutationGeneric({
  args: { ...authArgs, enabled: v.boolean() },
  handler: async (ctx, args) => {
    const { room, context } = await verified(ctx, args.roomId, args.capability);
    await ctx.db.patch(room._id, {
      state: setPresenter(room.state, context, args.enabled),
    });
    return null;
  },
});
export const follow = mutationGeneric({
  args: { ...authArgs, enabled: v.boolean() },
  handler: async (ctx, args) => {
    const { room, context } = await verified(ctx, args.roomId, args.capability);
    await ctx.db.patch(room._id, {
      state: followPresenter(room.state, context, args.enabled),
    });
    return null;
  },
});
