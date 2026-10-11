import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { describe, expect, it } from 'vitest';
import schema from '../convex/schema';
import type { PresenceInput, PublicRoom } from '../src/domain/rooms';

type Membership = { roomId: string; participantId: string; capability: string };
type Invitation = { roomId: string; inviteId: string; invitation: string };
const refs = {
  create: makeFunctionReference<'action', { name: string }, Membership>(
    'rooms:create',
  ),
  invite: makeFunctionReference<
    'action',
    { roomId: string; capability: string; role: 'editor' | 'viewer' },
    Invitation
  >('rooms:invite'),
  join: makeFunctionReference<
    'action',
    { roomId: string; invitation: string; name: string },
    Membership
  >('rooms:join'),
  view: makeFunctionReference<
    'query',
    { roomId: string; capability: string },
    PublicRoom
  >('rooms:view'),
  revokeInvite: makeFunctionReference<
    'mutation',
    { roomId: string; capability: string; inviteId: string },
    null
  >('rooms:revokeInvitation'),
  presence: makeFunctionReference<
    'mutation',
    { roomId: string; capability: string; presence: PresenceInput },
    null
  >('rooms:presence'),
  present: makeFunctionReference<
    'mutation',
    { roomId: string; capability: string; enabled: boolean },
    null
  >('rooms:present'),
  follow: makeFunctionReference<
    'mutation',
    { roomId: string; capability: string; enabled: boolean },
    null
  >('rooms:follow'),
  command: makeFunctionReference<
    'mutation',
    {
      roomId: string;
      capability: string;
      id: string;
      expectedRevision: number;
      command: { type: 'set-target'; itemId: string; rate: string };
    },
    { revision: number; duplicate: boolean }
  >('rooms:command'),
};
// convex-test locates the functions directory via a generated-path marker. This
// virtual, test-only map entry avoids checking in fabricated generated files.
const modules = {
  '../convex/_generated/test-marker.ts': async () => ({}),
  '../convex/rooms.ts': () => import('../convex/rooms'),
};
const auth = (member: Membership) => ({
  roomId: member.roomId,
  capability: member.capability,
});
const request = (
  membership: Membership,
  id = 'edit',
  expectedRevision = 0,
  rate = '2',
) => ({
  roomId: membership.roomId,
  capability: membership.capability,
  id,
  expectedRevision,
  command: { type: 'set-target' as const, itemId: 'iron', rate },
});

describe('transactional Convex room functions', () => {
  it('creates random capabilities and only persists their hashes', async () => {
    const t = convexTest(schema, modules);
    const owner = await t.action(refs.create, { name: 'Alex' });
    expect(owner.capability).toMatch(/^[0-9a-f]{64}$/);
    const view = await t.query(refs.view, auth(owner));
    expect(view.participants[owner.participantId]?.role).toBe('owner');
    const stored = await t.run(async (ctx) => ({
      rooms: await ctx.db.query('rooms').collect(),
      capabilities: await ctx.db.query('capabilities').collect(),
    }));
    expect(JSON.stringify(stored)).not.toContain(owner.capability);
    expect(JSON.stringify(view)).not.toMatch(/digest|receipts|capability/);
  });
  it('enforces role-bound invites, eight users, isolation and single use', async () => {
    const t = convexTest(schema, modules);
    const owner = await t.action(refs.create, { name: 'Alex' });
    const memberships = [owner];
    for (let i = 1; i < 9; i++) {
      const invitation = await t.action(refs.invite, {
        ...auth(owner),
        role: i === 1 ? 'viewer' : 'editor',
      });
      const member = await t.action(refs.join, {
        roomId: owner.roomId,
        invitation: invitation.invitation,
        name: `User ${i}`,
      });
      memberships.push(member);
      await expect(
        t.action(refs.join, {
          roomId: owner.roomId,
          invitation: invitation.invitation,
          name: 'Replay',
        }),
      ).rejects.toThrow(/invalid-invite/);
    }
    expect(
      Object.keys((await t.query(refs.view, auth(owner))).participants),
    ).toHaveLength(9);
    await expect(
      t.mutation(refs.command, request(memberships[1]!)),
    ).rejects.toThrow(/forbidden/);
    await expect(
      t.action(refs.invite, { ...auth(memberships[2]!), role: 'editor' }),
    ).rejects.toThrow(/forbidden/);
    const other = await t.action(refs.create, { name: 'Other' });
    await expect(
      t.query(refs.view, {
        roomId: other.roomId,
        capability: owner.capability,
      }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      t.mutation(refs.command, { ...request(owner), roomId: other.roomId }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      t.query(refs.view, { roomId: owner.roomId, capability: '0'.repeat(64) }),
    ).rejects.toThrow(/forbidden/);
  });
  it('commits commands and receipts atomically with stale and invalid edits rejected', async () => {
    const t = convexTest(schema, modules);
    const owner = await t.action(refs.create, { name: 'Alex' });
    expect(await t.mutation(refs.command, request(owner))).toEqual({
      revision: 1,
      duplicate: false,
    });
    expect(await t.mutation(refs.command, request(owner))).toEqual({
      revision: 1,
      duplicate: true,
    });
    await expect(
      t.mutation(refs.command, request(owner, 'edit', 0, '3')),
    ).rejects.toThrow(/command-id-reused/);
    await expect(
      t.mutation(refs.command, request(owner, 'stale', 0, '3')),
    ).rejects.toThrow(/revision-conflict/);
    await expect(
      t.mutation(refs.command, request(owner, 'invalid', 1, '1/0')),
    ).rejects.toThrow(/invalid-command/);
    const view = await t.query(refs.view, auth(owner));
    expect(view.revision).toBe(1);
    expect(view.intent.targets).toEqual({ iron: '2' });
    const state = await t.run(
      async (ctx) => (await ctx.db.query('rooms').collect())[0]?.state,
    );
    expect(Object.keys(state?.receipts ?? {})).toEqual(['edit']);
  });
  it('revokes invitations at the owner boundary and allows opt-in presentation', async () => {
    const t = convexTest(schema, modules);
    const owner = await t.action(refs.create, { name: 'Alex' });
    const invitation = await t.action(refs.invite, {
      ...auth(owner),
      role: 'viewer',
    });
    const viewer = await t.action(refs.join, {
      roomId: owner.roomId,
      invitation: invitation.invitation,
      name: 'Val',
    });
    const revoked = await t.action(refs.invite, {
      ...auth(owner),
      role: 'editor',
    });
    await expect(
      t.mutation(refs.revokeInvite, {
        ...auth(viewer),
        inviteId: revoked.inviteId,
      }),
    ).rejects.toThrow(/forbidden/);
    await t.mutation(refs.revokeInvite, {
      ...auth(owner),
      inviteId: revoked.inviteId,
    });
    await expect(
      t.action(refs.join, {
        roomId: owner.roomId,
        invitation: revoked.invitation,
        name: 'New',
      }),
    ).rejects.toThrow(/invalid-invite/);
    await t.mutation(refs.presence, {
      ...auth(owner),
      presence: { view: 'layout', floor: 2, cursor: { x: 5, y: 6 } },
    });
    await t.mutation(refs.present, { ...auth(owner), enabled: true });
    let view = await t.query(refs.view, auth(viewer));
    expect(view.participants[viewer.participantId]?.presence.following).toBe(
      false,
    );
    expect(view.participants[owner.participantId]?.presence.cursor).toBeNull();
    await t.mutation(refs.follow, { ...auth(viewer), enabled: true });
    view = await t.query(refs.view, auth(viewer));
    expect(view.participants[viewer.participantId]?.presence).toMatchObject({
      following: true,
      view: 'layout',
      floor: 2,
    });
    await t.mutation(refs.follow, { ...auth(viewer), enabled: false });
    expect(
      (await t.query(refs.view, auth(viewer))).participants[
        viewer.participantId
      ]?.presence,
    ).toMatchObject({ following: false, view: 'production', floor: 0 });
    await expect(
      t.mutation(refs.present, { ...auth(viewer), enabled: true }),
    ).rejects.toThrow(/forbidden/);
    expect((await t.query(refs.view, auth(owner))).revision).toBe(0);
  });
});
