import { convexTest } from 'convex-test';
import { expect, it } from 'vitest';
import schema from '../convex/schema';
import { roomApi, type Membership } from '../src/room-api';
import { initialSharedPlan } from '../src/domain/shared-plan';
import { makeFunctionReference } from 'convex/server';
const modules = {
  '../convex/_generated/test-marker.ts': async () => ({}),
  '../convex/rooms.ts': () => import('../convex/rooms'),
  '../convex/plans.ts': () => import('../convex/plans'),
};
const auth = (m: Membership) => ({
  roomId: m.roomId,
  capability: m.capability,
});
const setup = async () => {
  const t = convexTest(schema, modules);
  const owner = await t.action(roomApi.create, {
    name: 'Creator',
    plan: initialSharedPlan(),
  });
  return { t, owner };
};
it('shares full state through reusable links without giving away owner authority', async () => {
  const { t, owner } = await setup();
  const a = await t.action(roomApi.join, {
    roomId: owner.roomId,
    shareSecret: owner.shareSecret,
    name: 'A',
  });
  const b = await t.action(roomApi.join, {
    roomId: owner.roomId,
    shareSecret: owner.shareSecret,
    name: 'B',
  });
  expect(a.capability).not.toBe(b.capability);
  expect(a.capability).not.toBe(owner.capability);
  const initial = await t.query(roomApi.view, auth(a));
  expect(initial.plan.production.targets).toEqual([
    { itemId: 'Desc_IronPlate_C', rate: '20' },
  ]);
  const plan = structuredClone(initial.plan);
  plan.layout.rows = 2;
  await t.mutation(roomApi.edit, {
    ...auth(a),
    id: 'edit-a',
    expectedRevision: 0,
    plan,
  });
  expect((await t.query(roomApi.view, auth(b))).plan.layout.rows).toBe(2);
  const invite = makeFunctionReference<'action'>('rooms:invite');
  await expect(
    t.action(invite, { ...auth(a), role: 'editor' }),
  ).rejects.toThrow('forbidden');
  const stored = await t.run(async (ctx) => ({
    shares: await ctx.db.query('roomLinks').collect(),
    members: await ctx.db.query('capabilities').collect(),
  }));
  expect(JSON.stringify(stored)).not.toContain(owner.shareSecret);
  expect(JSON.stringify(stored)).not.toContain(owner.capability);
});
it('records paginated immutable history and compensates while preserving unrelated later edits', async () => {
  const { t, owner } = await setup();
  const p = initialSharedPlan();
  p.layout.rows = 2;
  await t.mutation(roomApi.edit, {
    ...auth(owner),
    id: 'rows',
    expectedRevision: 0,
    plan: p,
  });
  p.production.targets[0]!.rate = '40';
  await t.mutation(roomApi.edit, {
    ...auth(owner),
    id: 'target',
    expectedRevision: 1,
    plan: p,
  });
  const page = await t.query(roomApi.history, {
    ...auth(owner),
    paginationOpts: { numItems: 1, cursor: null },
  });
  expect(page.page[0]!.revision).toBe(2);
  expect(page.isDone).toBe(false);
  const older = await t.query(roomApi.history, {
    ...auth(owner),
    paginationOpts: { numItems: 1, cursor: page.continueCursor },
  });
  expect(older.page[0]!.author).toBe('Creator');
  expect(older.page[0]!.timestamp).toBeGreaterThan(0);
  await t.mutation(roomApi.undo, {
    ...auth(owner),
    id: 'undo-rows',
    expectedRevision: 2,
    entryId: older.page[0]!.id,
  });
  const undone = await t.query(roomApi.view, auth(owner));
  expect(undone.plan.layout.rows).toBe(0);
  expect(undone.plan.production.targets[0]!.rate).toBe('40');
  const history = await t.query(roomApi.history, {
    ...auth(owner),
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(history.page).toHaveLength(3);
  expect(history.page[0]!.undoOf).toBe(older.page[0]!.id);
  await t.mutation(roomApi.undo, {
    ...auth(owner),
    id: 'undo-undo',
    expectedRevision: 3,
    entryId: history.page[0]!.id,
  });
  expect((await t.query(roomApi.view, auth(owner))).plan.layout.rows).toBe(2);
});
it('rejects stale writes, overlapping undo and reused IDs atomically, but accepts identical retries', async () => {
  const { t, owner } = await setup();
  const p = initialSharedPlan();
  p.layout.rows = 2;
  const request = {
    ...auth(owner),
    id: 'one',
    expectedRevision: 0,
    plan: structuredClone(p),
  };
  await t.mutation(roomApi.edit, request);
  p.layout.rows = 4;
  await t.mutation(roomApi.edit, {
    ...auth(owner),
    id: 'two',
    expectedRevision: 1,
    plan: p,
  });
  expect(await t.mutation(roomApi.edit, request)).toEqual({
    revision: 1,
    duplicate: true,
  });
  await expect(
    t.mutation(roomApi.edit, { ...request, plan: p }),
  ).rejects.toThrow('command-id-reused');
  await expect(
    t.mutation(roomApi.edit, { ...request, id: 'stale' }),
  ).rejects.toThrow('revision-conflict');
  const h = await t.query(roomApi.history, {
    ...auth(owner),
    paginationOpts: { numItems: 10, cursor: null },
  });
  await expect(
    t.mutation(roomApi.undo, {
      ...auth(owner),
      id: 'undo',
      expectedRevision: 2,
      entryId: h.page[1]!.id,
    }),
  ).rejects.toThrow('undo-conflict');
  expect((await t.query(roomApi.view, auth(owner))).revision).toBe(2);
  expect(
    (
      await t.query(roomApi.history, {
        ...auth(owner),
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page,
  ).toHaveLength(2);
});
it('denies cross-room reads, writes and undo and rejects invalid plans', async () => {
  const { t, owner } = await setup();
  const other = await t.action(roomApi.create, {
    name: 'Other',
    plan: initialSharedPlan(),
  });
  await expect(
    t.query(roomApi.view, {
      roomId: other.roomId,
      capability: owner.capability,
    }),
  ).rejects.toThrow('forbidden');
  await expect(
    t.action(roomApi.join, {
      roomId: other.roomId,
      shareSecret: owner.shareSecret,
      name: 'Intruder',
    }),
  ).rejects.toThrow('forbidden');
  const p = initialSharedPlan();
  p.layout.rows = 2;
  await t.mutation(roomApi.edit, {
    ...auth(owner),
    id: 'edit',
    expectedRevision: 0,
    plan: p,
  });
  const h = await t.query(roomApi.history, {
    ...auth(owner),
    paginationOpts: { numItems: 10, cursor: null },
  });
  await expect(
    t.mutation(roomApi.undo, {
      ...auth(other),
      id: 'undo',
      expectedRevision: 0,
      entryId: h.page[0]!.id,
    }),
  ).rejects.toThrow('forbidden');
  p.production.targets[0]!.rate = '-1';
  await expect(
    t.mutation(roomApi.edit, {
      ...auth(owner),
      id: 'invalid',
      expectedRevision: 1,
      plan: p,
    }),
  ).rejects.toThrow();
  expect((await t.query(roomApi.view, auth(owner))).revision).toBe(1);
});
it('keeps viewer access read-only and prevents legacy commands bypassing plan history', async () => {
  const { t, owner } = await setup();
  const invitation = (await t.action(
    makeFunctionReference<'action'>('rooms:invite'),
    { ...auth(owner), role: 'viewer' },
  )) as { invitation: string };
  const viewer = (await t.action(
    makeFunctionReference<'action'>('rooms:join'),
    { roomId: owner.roomId, invitation: invitation.invitation, name: 'Viewer' },
  )) as Membership;
  expect((await t.query(roomApi.view, auth(viewer))).revision).toBe(0);
  const p = initialSharedPlan();
  p.layout.rows = 2;
  await expect(
    t.mutation(roomApi.edit, {
      ...auth(viewer),
      id: 'edit',
      expectedRevision: 0,
      plan: p,
    }),
  ).rejects.toThrow('forbidden');
  await expect(
    t.mutation(makeFunctionReference<'mutation'>('rooms:command'), {
      ...auth(owner),
      id: 'legacy',
      expectedRevision: 0,
      command: { type: 'set-target', itemId: 'iron', rate: '4' },
    }),
  ).rejects.toThrow('shared-plan-command-required');
  expect((await t.query(roomApi.view, auth(owner))).revision).toBe(0);
});
it('denies a stale membership capability after the participant is removed', async () => {
  const { t, owner } = await setup();
  const member = await t.action(roomApi.join, {
    roomId: owner.roomId,
    shareSecret: owner.shareSecret,
    name: 'Removed',
  });
  await t.run(async (ctx) => {
    const room = await ctx.db
      .query('rooms')
      .withIndex('by_room', (q) => q.eq('roomId', owner.roomId))
      .unique();
    const state = room!.state;
    delete state.participants[member.participantId];
    await ctx.db.patch(room!._id, { state });
  });
  await expect(t.query(roomApi.view, auth(member))).rejects.toThrow(
    'forbidden',
  );
  await expect(
    t.query(roomApi.history, {
      ...auth(member),
      paginationOpts: { numItems: 10, cursor: null },
    }),
  ).rejects.toThrow('forbidden');
});
