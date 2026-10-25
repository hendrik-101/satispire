import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { describe, expect, it, vi } from 'vitest';
import schema from '../convex/schema';
import { createUnlockProfile } from '../src/domain/session-unlocks';
import { vanillaCatalog } from '../src/domain/vanilla';
import { defaultBuildVariant } from '../src/domain/build-variants';
import type {
  SessionMembership,
  SessionPlan,
  SessionSnapshot,
  SessionPresence,
  SessionPresenceInput,
} from '../src/session-plan';
type Auth = Pick<SessionMembership, 'sessionId' | 'capability'>;
const refs = {
  create: makeFunctionReference<
    'action',
    { name: string; plan: unknown },
    SessionMembership
  >('sessions:create'),
  join: makeFunctionReference<
    'action',
    { name: string; sessionId: string },
    SessionMembership
  >('sessions:join'),
  read: makeFunctionReference<'query', Auth, SessionSnapshot>('sessions:read'),
  commit: makeFunctionReference<
    'mutation',
    Auth & { id: string; expectedRevision: number; plan: unknown },
    { revision: number; duplicate: boolean }
  >('sessions:commit'),
  presence: makeFunctionReference<
    'mutation',
    {
      [K in keyof (Auth & SessionPresenceInput & { clientId: string })]: (Auth &
        SessionPresenceInput & { clientId: string })[K];
    },
    null
  >('sessions:presence'),
  peers: makeFunctionReference<
    'query',
    Auth & Pick<SessionPresenceInput, 'view' | 'floor'>,
    SessionPresence[]
  >('sessions:peers'),
};
const modules = {
  '../convex/_generated/test-marker.ts': async () => ({}),
  '../convex/sessions.ts': () => import('../convex/sessions'),
};
const plan: SessionPlan = {
  schemaVersion: 1,
  catalogVersion: vanillaCatalog.catalogVersion,
  production: {
    targets: [{ itemId: 'Desc_IronPlate_C', rate: '20' }],
    recipes: {
      Desc_IronPlate_C: 'Recipe_IronPlate_C',
      Desc_IronIngot_C: 'Recipe_IngotIron_C',
    },
    imports: ['Desc_OreIron_C'],
  },
  layout: { rows: 0, variant: defaultBuildVariant },
};
const auth = (m: SessionMembership) => ({
  sessionId: m.sessionId,
  capability: m.capability,
});
describe('durable anonymous sessions', () => {
  it('persists complete plans, joins and atomically protects revisions and retries', async () => {
    const t = convexTest(schema, modules);
    const a = await t.action(refs.create, { name: ' Alice ', plan });
    expect(a.sessionId).toMatch(/^[a-f0-9]{64}$/);
    const b = await t.action(refs.join, {
      sessionId: a.sessionId,
      name: 'Bob',
    });
    expect(await t.query(refs.read, auth(b))).toEqual({ revision: 0, plan });
    const change = { ...auth(a), id: 'edit', expectedRevision: 0, plan };
    expect(await t.mutation(refs.commit, change)).toEqual({
      revision: 1,
      duplicate: false,
    });
    expect(await t.mutation(refs.commit, change)).toEqual({
      revision: 1,
      duplicate: true,
    });
    await expect(
      t.mutation(refs.commit, { ...change, id: 'stale' }),
    ).rejects.toThrow(/revision-conflict/);
    const other = await t.action(refs.create, { name: 'Other', plan });
    await expect(
      t.query(refs.read, { ...auth(a), capability: other.capability }),
    ).rejects.toThrow(/forbidden/);
  });
  it('validates plans and isolates scoped ephemeral cursors without editing plans', async () => {
    const t = convexTest(schema, modules);
    const a = await t.action(refs.create, { name: 'Alice', plan });
    const b = await t.action(refs.join, {
      sessionId: a.sessionId,
      name: 'Bob',
    });
    await expect(
      t.mutation(refs.commit, {
        ...auth(a),
        id: 'bad',
        expectedRevision: 0,
        plan: { ...plan, catalogVersion: 'bad' },
      }),
    ).rejects.toThrow();
    await t.mutation(refs.presence, {
      ...auth(b),
      clientId: 'tab',
      view: 'layout',
      floor: 'iron',
      cursor: { x: 3, y: 4 },
    });
    expect(
      await t.query(refs.peers, { ...auth(a), view: 'layout', floor: 'iron' }),
    ).toMatchObject([
      { participantId: b.participantId, name: 'Bob', cursor: { x: 3, y: 4 } },
    ]);
    expect(
      await t.query(refs.peers, { ...auth(a), view: 'layout', floor: 'other' }),
    ).toEqual([]);
    expect((await t.query(refs.read, auth(a))).revision).toBe(0);
    await t.run(async (ctx) => {
      const p = await ctx.db.query('sessionPresence').first();
      await ctx.db.patch(p!._id, { updatedAt: Date.now() - 16000 });
    });
    expect(
      await t.query(refs.peers, { ...auth(a), view: 'layout', floor: 'iron' }),
    ).toEqual([]);
  });
  it('bounds retained retries and stores only hashed private credentials', async () => {
    const t = convexTest(schema, modules);
    const a = await t.action(refs.create, { name: 'Alice', plan });
    await t.run(async (ctx) => {
      const member = await ctx.db.query('sessionMembers').first();
      expect(member?.digest).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(member)).not.toContain(a.capability);
    });
    for (let revision = 0; revision < 129; revision++)
      await t.mutation(refs.commit, {
        ...auth(a),
        id: `edit-${revision}`,
        expectedRevision: revision,
        plan,
      });
    await t.run(async (ctx) => {
      const s = await ctx.db.query('sessions').first();
      expect(s?.receipts).toHaveLength(128);
      expect(s?.receipts[0]?.fingerprint).toHaveLength(64);
    });
    await expect(
      t.mutation(refs.commit, {
        ...auth(a),
        id: 'edit-0',
        expectedRevision: 0,
        plan,
      }),
    ).rejects.toThrow(/revision-conflict/);
    await expect(
      t.mutation(refs.commit, {
        ...auth(a),
        id: 'edit-128',
        expectedRevision: 128,
        plan: { ...plan, layout: { ...plan.layout, rows: 1 } },
      }),
    ).rejects.toThrow(/command-id-reused/);
  });
  it('rejects unsolvable, oversized and malformed plans and missing sessions', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(refs.join, { sessionId: '0'.repeat(64), name: 'Bob' }),
    ).rejects.toThrow(/forbidden/);
    await expect(t.action(refs.create, { name: ' ', plan })).rejects.toThrow(
      /invalid-participant/,
    );
    await expect(
      t.action(refs.create, {
        name: 'Alice',
        plan: { ...plan, production: { ...plan.production, recipes: {} } },
      }),
    ).rejects.toThrow();
    await expect(
      t.action(refs.create, {
        name: 'Alice',
        plan: { ...plan, extra: 'x'.repeat(262144) },
      }),
    ).rejects.toThrow(/plan-too-large/);
  });
  it('scheduled expiry removes abandoned cursor rows', async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const a = await t.action(refs.create, { name: 'Alice', plan });
      await t.mutation(refs.presence, {
        ...auth(a),
        clientId: 'tab',
        view: 'production',
        floor: 'iron',
        cursor: { x: 1, y: 2 },
      });
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      await t.run(async (ctx) => {
        expect(await ctx.db.query('sessionPresence').collect()).toEqual([]);
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it('keeps one expiry task per client and extends it after a heartbeat', async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const a = await t.action(refs.create, { name: 'Alice', plan });
      const presence = {
        ...auth(a),
        clientId: 'tab',
        view: 'production' as const,
        floor: 'iron',
        cursor: { x: 1, y: 2 },
      };
      await t.mutation(refs.presence, presence);
      await vi.advanceTimersByTimeAsync(10000);
      await t.mutation(refs.presence, { ...presence, cursor: { x: 3, y: 4 } });
      await t.run(async (ctx) => {
        expect(
          await ctx.db.system.query('_scheduled_functions').collect(),
        ).toHaveLength(1);
      });
      await vi.advanceTimersByTimeAsync(5000);
      await t.finishInProgressScheduledFunctions();
      await t.run(async (ctx) => {
        expect(await ctx.db.query('sessionPresence').collect()).toHaveLength(1);
      });
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      await t.run(async (ctx) => {
        expect(await ctx.db.query('sessionPresence').collect()).toEqual([]);
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it('validates unlock semantics while preserving an outdated valid calculated plan', async () => {
    const t = convexTest(schema, modules);
    const profile = createUnlockProfile(9);
    const a = await t.action(refs.create, { name: 'Alice', plan });
    const malformed = [
      { ...profile, spaceElevatorPhase: 0 },
      { ...profile, catalogVersion: 'other' },
      {
        ...profile,
        hubTier: null,
        technology: {
          ...profile.technology,
          availableMachines: ['unknown-machine'],
        },
      },
      { ...profile, hubTier: 2 },
    ];
    for (const unlocks of malformed) {
      const bad = { ...plan, unlocks };
      await expect(
        t.action(refs.create, { name: 'Bob', plan: bad }),
      ).rejects.toThrow();
      await expect(
        t.mutation(refs.commit, {
          ...auth(a),
          id: 'poison',
          expectedRevision: 0,
          plan: bad,
        }),
      ).rejects.toThrow();
    }
    const valid = {
      ...plan,
      production: { ...plan.production, technology: profile.technology },
      unlocks: createUnlockProfile(0),
    };
    await t.mutation(refs.commit, {
      ...auth(a),
      id: 'outdated',
      expectedRevision: 0,
      plan: valid,
    });
    expect((await t.query(refs.read, auth(a))).plan).toEqual(valid);
  });
  it('denies cross-session writes and presence access and bounds active tabs', async () => {
    const t = convexTest(schema, modules);
    const a = await t.action(refs.create, { name: 'Alice', plan });
    const b = await t.action(refs.create, { name: 'Bob', plan });
    const wrong = { sessionId: a.sessionId, capability: b.capability };
    const location = { view: 'layout' as const, floor: 'iron' };
    await expect(
      t.mutation(refs.commit, {
        ...wrong,
        id: 'cross',
        expectedRevision: 0,
        plan,
      }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      t.mutation(refs.presence, {
        ...wrong,
        ...location,
        clientId: 'tab',
        cursor: null,
      }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      t.query(refs.peers, { ...wrong, ...location }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      t.mutation(refs.presence, {
        ...auth(a),
        ...location,
        clientId: 'tab',
        cursor: { x: Infinity, y: 0 },
      }),
    ).rejects.toThrow(/invalid-presence/);
    for (let i = 0; i < 8; i++)
      await t.mutation(refs.presence, {
        ...auth(a),
        ...location,
        clientId: `tab-${i}`,
        cursor: null,
      });
    await expect(
      t.mutation(refs.presence, {
        ...auth(a),
        ...location,
        clientId: 'ninth',
        cursor: null,
      }),
    ).rejects.toThrow(/too-many-clients/);
    await t.mutation(refs.presence, {
      ...auth(a),
      ...location,
      clientId: 'tab-0',
      cursor: { x: 1, y: 2 },
    });
  });
  it('charges failed creates and rejects admission without affecting existing members', async () => {
    const t = convexTest(schema, modules);
    const a = await t.action(refs.create, { name: 'Alice', plan });
    for (let i = 0; i < 4; i++)
      await expect(
        t.action(refs.create, { name: 'Bad', plan: {} }),
      ).rejects.toThrow();
    await expect(
      t.action(refs.create, { name: 'Limited', plan }),
    ).rejects.toThrow(/rate-limited/);
    expect((await t.query(refs.read, auth(a))).revision).toBe(0);
    await t.action(refs.join, { sessionId: a.sessionId, name: 'Bob' });
    await t.run(async (ctx) => {
      const row = await ctx.db.query('sessionAdmission').first();
      await ctx.db.patch(row!._id, { windowStart: Date.now() - 60001 });
    });
    await t.action(refs.create, { name: 'After window', plan });
    await t.run(async (ctx) => {
      const row = await ctx.db.query('sessionAdmission').first();
      await ctx.db.patch(row!._id, { durableCount: 512 });
    });
    await expect(t.action(refs.create, { name: 'Full', plan })).rejects.toThrow(
      /session-limit/,
    );
  });
  it('serializes the durable quota across concurrent creations', async () => {
    const t = convexTest(schema, modules);
    await t.action(refs.create, { name: 'Existing', plan });
    await t.run(async (ctx) => {
      const row = await ctx.db.query('sessionAdmission').first();
      await ctx.db.patch(row!._id, { durableCount: 511 });
    });
    const results = await Promise.allSettled([
      t.action(refs.create, { name: 'A', plan }),
      t.action(refs.create, { name: 'B', plan }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await t.run(async (ctx) => {
      expect(
        (await ctx.db.query('sessionAdmission').first())?.durableCount,
      ).toBe(512);
    });
  });
});
