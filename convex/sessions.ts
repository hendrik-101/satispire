import {
  actionGeneric,
  internalMutationGeneric,
  mutationGeneric,
  queryGeneric,
  makeFunctionReference,
  type DataModelFromSchemaDefinition,
  type GenericActionCtx,
  type GenericMutationCtx,
  type GenericQueryCtx,
} from 'convex/server';
import { v } from 'convex/values';
import schema from './schema';
import {
  validateSessionPlan,
  type SessionMembership,
} from '../src/session-plan';
type Ctx = GenericQueryCtx<DataModelFromSchemaDefinition<typeof schema>>;
const auth = { sessionId: v.string(), capability: v.string() };
const secret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
async function hash(s: string) {
  if (!/^[a-f0-9]{64}$/.test(s)) throw new Error('forbidden');
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
async function session(ctx: Ctx, id: string) {
  const s = await ctx.db
    .query('sessions')
    .withIndex('by_session', (q) => q.eq('sessionId', id))
    .unique();
  if (!s) throw new Error('forbidden');
  return s;
}
async function verified(
  ctx: Ctx,
  a: { sessionId: string; capability: string },
) {
  const digest = await hash(a.capability);
  const member = await ctx.db
    .query('sessionMembers')
    .withIndex('by_digest', (q) => q.eq('digest', digest))
    .unique();
  if (!member || member.sessionId !== a.sessionId) throw new Error('forbidden');
  return { member, s: await session(ctx, a.sessionId) };
}
const registerRef = makeFunctionReference<'mutation'>('sessions:register');
async function membership(
  ctx: GenericActionCtx<DataModelFromSchemaDefinition<typeof schema>>,
  args: { name: string; sessionId?: string; plan?: unknown },
): Promise<SessionMembership> {
  const capability = secret();
  const participantId = crypto.randomUUID();
  const sessionId = args.sessionId ?? secret();
  await ctx.runMutation(registerRef, {
    ...args,
    sessionId,
    participantId,
    digest: await hash(capability),
  });
  return { sessionId, participantId, capability };
}
export const create = actionGeneric({
  args: { plan: v.any(), name: v.string() },
  handler: (ctx, args) => membership(ctx, args),
});
export const join = actionGeneric({
  args: { sessionId: v.string(), name: v.string() },
  handler: (ctx, args) => membership(ctx, args),
});
export const register = internalMutationGeneric({
  args: {
    sessionId: v.string(),
    participantId: v.string(),
    digest: v.string(),
    name: v.string(),
    plan: v.optional(v.any()),
  },
  handler: async (ctx, a) => {
    const name = a.name.trim();
    if (!name || name.length > 80 || !/^[a-f0-9]{64}$/.test(a.sessionId))
      throw new Error('invalid-participant');
    let count = 0;
    if (a.plan !== undefined) {
      const plan = validateSessionPlan(a.plan);
      await ctx.db.insert('sessions', {
        sessionId: a.sessionId,
        revision: 0,
        plan,
        members: 1,
        receipts: [],
      });
    } else {
      const s = await session(ctx, a.sessionId);
      count = s.members;
      if (count >= 128) throw new Error('session-full');
      await ctx.db.patch(s._id, { members: count + 1 });
    }
    await ctx.db.insert('sessionMembers', {
      sessionId: a.sessionId,
      participantId: a.participantId,
      digest: a.digest,
      name,
      color: ['#f39a45', '#60bfa3', '#8e9ff1', '#e69bc5'][count % 4]!,
    });
    return null;
  },
});
export const read = queryGeneric({
  args: auth,
  handler: async (ctx, a) => {
    const { s } = await verified(ctx, a);
    return { revision: s.revision, plan: s.plan };
  },
});
/** Only the most recent 128 commits retain retry receipts. Older retries conflict. */
export const commit = mutationGeneric({
  args: {
    ...auth,
    id: v.string(),
    expectedRevision: v.number(),
    plan: v.any(),
  },
  handler: async (ctx, a) => {
    const { s, member } = await verified(ctx, a);
    if (
      !/^[A-Za-z0-9._:-]{1,128}$/.test(a.id) ||
      !Number.isSafeInteger(a.expectedRevision) ||
      a.expectedRevision < 0
    )
      throw new Error('invalid-command');
    const plan = validateSessionPlan(a.plan);
    const fingerprint = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify([a.expectedRevision, plan])),
        ),
      ),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    const receipt = s.receipts.find((r) => r.id === a.id);
    if (receipt) {
      if (
        receipt.participantId !== member.participantId ||
        receipt.fingerprint !== fingerprint
      )
        throw new Error('command-id-reused');
      return { revision: receipt.revision, duplicate: true };
    }
    if (s.revision !== a.expectedRevision) throw new Error('revision-conflict');
    const revision = s.revision + 1;
    if (!Number.isSafeInteger(revision)) throw new Error('invalid-command');
    await ctx.db.patch(s._id, {
      revision,
      plan,
      receipts: [
        ...s.receipts,
        {
          id: a.id,
          participantId: member.participantId,
          fingerprint,
          revision,
        },
      ].slice(-128),
    });
    return { revision, duplicate: false };
  },
});
const location = {
  view: v.union(v.literal('production'), v.literal('layout')),
  floor: v.string(),
};
const expireRef = makeFunctionReference<'mutation'>('sessions:expire');
export const presence = mutationGeneric({
  args: {
    ...auth,
    ...location,
    clientId: v.string(),
    cursor: v.union(v.null(), v.object({ x: v.number(), y: v.number() })),
  },
  handler: async (
    ctx: GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>>,
    a,
  ) => {
    const { member } = await verified(ctx, a);
    if (
      !/^[A-Za-z0-9._:-]{1,128}$/.test(a.clientId) ||
      a.floor.length > 256 ||
      (a.cursor &&
        (!Number.isFinite(a.cursor.x) || !Number.isFinite(a.cursor.y)))
    )
      throw new Error('invalid-presence');
    const existing = await ctx.db
      .query('sessionPresence')
      .withIndex('by_session_participant_client', (q) =>
        q
          .eq('sessionId', a.sessionId)
          .eq('participantId', member.participantId)
          .eq('clientId', a.clientId),
      )
      .unique();
    if (!existing) {
      const clients = await ctx.db
        .query('sessionPresence')
        .withIndex('by_session_participant_client', (q) =>
          q
            .eq('sessionId', a.sessionId)
            .eq('participantId', member.participantId),
        )
        .take(8);
      if (clients.length >= 8) throw new Error('too-many-clients');
    }
    const updatedAt = Date.now();
    const value = {
      sessionId: a.sessionId,
      participantId: member.participantId,
      clientId: a.clientId,
      name: member.name,
      color: member.color,
      view: a.view,
      floor: a.floor,
      cursor: a.cursor,
      updatedAt,
    };
    if (existing) await ctx.db.patch(existing._id, value);
    else {
      await ctx.db.insert('sessionPresence', value);
      await ctx.scheduler.runAfter(15000, expireRef, {
        sessionId: a.sessionId,
        participantId: member.participantId,
        clientId: a.clientId,
      });
    }
    return null;
  },
});
export const expire = internalMutationGeneric({
  args: {
    sessionId: v.string(),
    participantId: v.string(),
    clientId: v.string(),
  },
  handler: async (
    ctx: GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>>,
    a,
  ) => {
    const p = await ctx.db
      .query('sessionPresence')
      .withIndex('by_session_participant_client', (q) =>
        q
          .eq('sessionId', a.sessionId)
          .eq('participantId', a.participantId)
          .eq('clientId', a.clientId),
      )
      .unique();
    if (p) {
      const remaining = p.updatedAt + 15000 - Date.now();
      if (remaining <= 0) await ctx.db.delete(p._id);
      else await ctx.scheduler.runAfter(remaining, expireRef, a);
    }
    return null;
  },
});
export const peers = queryGeneric({
  args: { ...auth, ...location },
  handler: async (ctx, a) => {
    const { member } = await verified(ctx, a);
    const all = await ctx.db
      .query('sessionPresence')
      .withIndex('by_session', (q) => q.eq('sessionId', a.sessionId))
      .collect();
    return all
      .filter(
        (p) =>
          p.participantId !== member.participantId &&
          p.view === a.view &&
          p.floor === a.floor &&
          p.updatedAt > Date.now() - 15000 &&
          p.cursor !== null,
      )
      .map(
        ({
          participantId,
          clientId,
          name,
          color,
          view,
          floor,
          cursor,
          updatedAt,
        }) => ({
          participantId,
          clientId,
          name,
          color,
          view,
          floor,
          cursor,
          updatedAt,
        }),
      );
  },
});
