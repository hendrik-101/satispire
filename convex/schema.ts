import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
const view = v.union(v.literal('production'), v.literal('layout'));
const cursor = v.union(v.null(), v.object({ x: v.number(), y: v.number() }));
const role = v.union(
  v.literal('owner'),
  v.literal('editor'),
  v.literal('viewer'),
);
export const unlockProfileValidator = v.object({
  schemaVersion: v.literal(1),
  catalogVersion: v.string(),
  hubTier: v.union(v.number(), v.null()),
  spaceElevatorPhase: v.number(),
  technology: v.object({
    availableMachines: v.array(v.string()),
    unlockedRecipes: v.array(v.string()),
    beltTier: v.number(),
    pipeTier: v.number(),
  }),
});
const state = v.object({
  id: v.string(),
  revision: v.number(),
  unlocks: v.optional(unlockProfileValidator),
  presenterId: v.union(v.string(), v.null()),
  intent: v.object({
    targets: v.record(v.string(), v.string()),
    blockRows: v.record(v.string(), v.number()),
  }),
  participants: v.record(
    v.string(),
    v.object({
      id: v.string(),
      name: v.string(),
      role,
      color: v.string(),
      presence: v.object({
        view,
        floor: v.number(),
        cursor,
        following: v.boolean(),
        previous: v.union(v.null(), v.object({ view, floor: v.number() })),
      }),
    }),
  ),
  invites: v.record(
    v.string(),
    v.object({
      id: v.string(),
      digest: v.string(),
      role: v.union(v.literal('editor'), v.literal('viewer')),
      used: v.boolean(),
      revoked: v.boolean(),
    }),
  ),
  receipts: v.record(
    v.string(),
    v.object({
      participantId: v.string(),
      fingerprint: v.string(),
      revision: v.number(),
    }),
  ),
});
export default defineSchema({
  plans: defineTable({ roomId: v.string(), plan: v.string() }).index(
    'by_room',
    ['roomId'],
  ),
  roomLinks: defineTable({ roomId: v.string(), digest: v.string() }).index(
    'by_room',
    ['roomId'],
  ),
  planHistory: defineTable({
    roomId: v.string(),
    revision: v.number(),
    participantId: v.string(),
    author: v.string(),
    timestamp: v.number(),
    summary: v.string(),
    undoOf: v.union(v.string(), v.null()),
    changes: v.array(
      v.object({
        field: v.union(
          v.literal('targets'),
          v.literal('recipes'),
          v.literal('imports'),
          v.literal('unlocks'),
          v.literal('rows'),
          v.literal('variant'),
        ),
        before: v.string(),
        after: v.string(),
      }),
    ),
  }).index('by_room_revision', ['roomId', 'revision']),
  planReceipts: defineTable({
    roomId: v.string(),
    commandId: v.string(),
    participantId: v.string(),
    fingerprint: v.string(),
    revision: v.number(),
  }).index('by_room_command', ['roomId', 'commandId']),
  sessionAdmission: defineTable({
    key: v.string(),
    windowStart: v.number(),
    attempts: v.number(),
    durableCount: v.number(),
  }).index('by_key', ['key']),
  sessions: defineTable({
    sessionId: v.string(),
    revision: v.number(),
    plan: v.any(),
    members: v.number(),
    receipts: v.array(
      v.object({
        id: v.string(),
        participantId: v.string(),
        fingerprint: v.string(),
        revision: v.number(),
      }),
    ),
  }).index('by_session', ['sessionId']),
  sessionMembers: defineTable({
    digest: v.string(),
    sessionId: v.string(),
    participantId: v.string(),
    name: v.string(),
    color: v.string(),
  }).index('by_digest', ['digest']),
  sessionPresence: defineTable({
    sessionId: v.string(),
    participantId: v.string(),
    clientId: v.string(),
    name: v.string(),
    color: v.string(),
    view,
    floor: v.string(),
    cursor,
    updatedAt: v.number(),
  })
    .index('by_session', ['sessionId'])
    .index('by_session_participant_client', [
      'sessionId',
      'participantId',
      'clientId',
    ]),
  rooms: defineTable({ roomId: v.string(), state }).index('by_room', [
    'roomId',
  ]),
  capabilities: defineTable({
    digest: v.string(),
    roomId: v.string(),
    participantId: v.string(),
  }).index('by_digest', ['digest']),
});
