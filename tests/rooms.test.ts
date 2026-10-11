import { describe, expect, it } from 'vitest';
import {
  applyRoomCommand,
  createRoom,
  createInvite,
  joinRoom,
  revokeInvite,
  roomView,
  setPresence,
  presenceFor,
  setPresenter,
  followPresenter,
} from '../src/domain/rooms';

const owner = { roomId: 'alpha', participantId: 'owner' };
const editor = { roomId: 'alpha', participantId: 'editor' };
const viewer = { roomId: 'alpha', participantId: 'viewer' };
const target = (id = 'command', expectedRevision = 0, rate = '3/2') => ({
  id,
  expectedRevision,
  command: { type: 'set-target' as const, itemId: 'iron', rate },
});
function fixture() {
  let room = createRoom({
    roomId: 'alpha',
    ownerId: 'owner',
    ownerName: 'Alex',
  });
  room = createInvite(room, owner, {
    id: 'edit',
    digest: 'editor-digest',
    role: 'editor',
  });
  room = createInvite(room, owner, {
    id: 'view',
    digest: 'viewer-digest',
    role: 'viewer',
  });
  room = joinRoom(room, 'editor-digest', { id: 'editor', name: 'Eli' });
  return joinRoom(room, 'viewer-digest', { id: 'viewer', name: 'Val' });
}

describe('room permissions and atomic commands', () => {
  it('lets owner and editor mutate exact planner intent', () => {
    const original = fixture();
    const first = applyRoomCommand(original, editor, target());
    expect(first.room.intent.targets).toEqual({ iron: '3/2' });
    expect(first.revision).toBe(1);
    const second = applyRoomCommand(first.room, owner, {
      id: 'rows',
      expectedRevision: 1,
      command: { type: 'set-block-rows', blockId: 'smelter', rows: 2 },
    });
    expect(second.room.intent.blockRows).toEqual({ smelter: 2 });
    expect(second.revision).toBe(2);
    expect(original.intent).toEqual({ targets: {}, blockRows: {} });
  });
  it.each([129, 200, 256])(
    'accepts catalog target IDs with slash at %i characters',
    (length) => {
      const room = fixture();
      const itemId = 'catalog/item/'.padEnd(length, 'x');
      const result = applyRoomCommand(room, owner, {
        ...target(),
        command: { type: 'set-target', itemId, rate: '1.50' },
      });
      expect(Object.keys(result.room.intent.targets)).toEqual([itemId]);
      expect(result.room.intent.targets[itemId]).toBe('3/2');
      expect(result.revision).toBe(1);
      expect(room.intent.targets).toEqual({});
    },
  );
  it.each([
    'catalog/item/'.padEnd(257, 'x'),
    '__proto__',
    'constructor',
    'prototype',
    'catalog/item%',
  ])('rejects invalid or unsafe catalog target ID %s atomically', (itemId) => {
    const room = fixture();
    expect(() =>
      applyRoomCommand(room, owner, {
        ...target(),
        command: { type: 'set-target', itemId, rate: '1' },
      }),
    ).toThrow(/invalid-command/);
    expect(room.intent.targets).toEqual({});
    expect(room.receipts).toEqual({});
    expect(room.revision).toBe(0);
    expect(Object.getPrototypeOf(room.intent.targets)).toBe(Object.prototype);
  });
  it('preserves the 128-character limit for command and block IDs', () => {
    const room = fixture();
    expect(() =>
      applyRoomCommand(room, owner, target('x'.repeat(129))),
    ).toThrow(/invalid-command/);
    expect(() =>
      applyRoomCommand(room, owner, {
        id: 'rows',
        expectedRevision: 0,
        command: { type: 'set-block-rows', blockId: 'x'.repeat(129), rows: 1 },
      }),
    ).toThrow(/invalid-command/);
  });
  it('normalizes exact rates and shares the planner arithmetic bounds', () => {
    const room = applyRoomCommand(
      fixture(),
      owner,
      target('decimal', 0, '1.50'),
    ).room;
    expect(room.intent.targets.iron).toBe('3/2');
    expect(() =>
      applyRoomCommand(room, owner, target('large', 1, '9'.repeat(61))),
    ).toThrow(/invalid-command/);
  });
  it('rejects viewers, unknown identities and context for another room', () => {
    const room = fixture();
    for (const context of [
      viewer,
      { ...owner, participantId: 'stranger' },
      { ...owner, roomId: 'beta' },
    ]) {
      expect(() => applyRoomCommand(room, context, target())).toThrow(
        /forbidden/,
      );
    }
    expect(room.revision).toBe(0);
  });
  it('rejects stale edits and preserves the winning edit', () => {
    const room = applyRoomCommand(fixture(), owner, target()).room;
    expect(() =>
      applyRoomCommand(room, editor, target('second', 0, '4')),
    ).toThrow(/revision-conflict/);
    expect(room.intent.targets.iron).toBe('3/2');
    expect(room.revision).toBe(1);
  });
  it('retries the same identity and payload without reapplying after later edits', () => {
    const first = applyRoomCommand(fixture(), owner, target()).room;
    const later = applyRoomCommand(first, editor, target('later', 1, '9')).room;
    const retry = applyRoomCommand(later, owner, target());
    expect(retry.duplicate).toBe(true);
    expect(retry.revision).toBe(1);
    expect(retry.room).toBe(later);
    expect(retry.room.intent.targets.iron).toBe('9');
  });
  it('binds each command ID to identity, payload and expected revision', () => {
    const room = applyRoomCommand(fixture(), owner, target()).room;
    expect(() => applyRoomCommand(room, editor, target())).toThrow(
      /command-id-reused/,
    );
    expect(() =>
      applyRoomCommand(room, owner, target('command', 0, '2')),
    ).toThrow(/command-id-reused/);
    expect(() => applyRoomCommand(room, owner, target('command', 1))).toThrow(
      /command-id-reused/,
    );
  });
  it.each(['0', '-1', '1/0', 'NaN', '1e3', '0/2'])(
    'rejects invalid target rate %s without changing state',
    (rate) => {
      const room = fixture();
      expect(() =>
        applyRoomCommand(room, owner, target('bad', 0, rate)),
      ).toThrow(/invalid-command/);
      expect(room.revision).toBe(0);
      expect(room.receipts).toEqual({});
    },
  );
  it('rejects malformed rows, unknown command and prototype property keys', () => {
    const room = fixture();
    for (const command of [
      { type: 'set-block-rows', blockId: 'x', rows: 0 },
      { type: 'set-block-rows', blockId: 'x', rows: 1.5 },
      { type: 'unknown' },
      { type: 'set-target', itemId: '__proto__', rate: '1' },
      { type: 'set-target', itemId: 'x', rate: '1', role: 'owner' },
    ])
      expect(() =>
        applyRoomCommand(room, owner, {
          id: 'bad',
          expectedRevision: 0,
          command,
        } as never),
      ).toThrow(/invalid-command/);
    expect(room.revision).toBe(0);
  });
  it('keeps room identities isolated even when participant IDs coincide', () => {
    const beta = createRoom({
      roomId: 'beta',
      ownerId: 'owner',
      ownerName: 'Alex',
    });
    expect(() => applyRoomCommand(beta, owner, target())).toThrow(/forbidden/);
    expect(
      applyRoomCommand(beta, { ...owner, roomId: 'beta' }, target()).room.intent
        .targets.iron,
    ).toBe('3/2');
  });
});

describe('membership and public state', () => {
  it('only the owner issues or revokes a role-bound single-use invitation', () => {
    const room = fixture();
    expect(() =>
      createInvite(room, editor, { id: 'x', digest: 'x', role: 'editor' }),
    ).toThrow(/forbidden/);
    expect(() => revokeInvite(room, viewer, 'edit')).toThrow(/forbidden/);
    expect(() =>
      joinRoom(room, 'editor-digest', { id: 'imposter', name: 'I' }),
    ).toThrow(/invalid-invite/);
    expect(() =>
      createInvite(room, owner, {
        id: 'x',
        digest: 'x',
        role: 'owner',
      } as never),
    ).toThrow(/invalid-invite/);
  });
  it('revokes unused invitations and rejects participant identity collisions', () => {
    let room = createRoom({
      roomId: 'alpha',
      ownerId: 'owner',
      ownerName: 'Alex',
    });
    room = createInvite(room, owner, { id: 'x', digest: 'x', role: 'editor' });
    expect(() => joinRoom(room, 'x', { id: 'owner', name: 'I' })).toThrow(
      /invalid-participant/,
    );
    room = revokeInvite(room, owner, 'x');
    expect(() => joinRoom(room, 'x', { id: 'new', name: 'I' })).toThrow(
      /invalid-invite/,
    );
  });
  it('accepts eight participants and permits a ninth', () => {
    let room = createRoom({
      roomId: 'alpha',
      ownerId: 'owner',
      ownerName: 'Alex',
    });
    for (let i = 1; i <= 8; i++) {
      room = createInvite(room, owner, {
        id: `i${i}`,
        digest: `d${i}`,
        role: 'editor',
      });
      if (i < 8)
        room = joinRoom(room, `d${i}`, { id: `p${i}`, name: `User ${i}` });
    }
    expect(Object.keys(room.participants)).toHaveLength(8);
    room = joinRoom(room, 'd8', { id: 'p8', name: 'User 8' });
    expect(Object.keys(room.participants)).toHaveLength(9);
    expect(room.invites.i8?.used).toBe(true);
  });
  it('requires membership for views and never returns invitation digests or command receipts', () => {
    const room = fixture();
    const view = roomView(room, viewer);
    expect(view.intent).toEqual({ targets: {}, blockRows: {} });
    expect(JSON.stringify(view)).not.toMatch(/digest|receipts|editor-digest/);
    expect(() => roomView(room, { ...viewer, roomId: 'beta' })).toThrow(
      /forbidden/,
    );
    view.intent.targets.iron = '99';
    expect(room.intent.targets.iron).toBeUndefined();
  });
});

describe('presence and optional presentation', () => {
  it('shows named colored cursors only in the same view and floor', () => {
    let room = setPresence(fixture(), owner, {
      view: 'layout',
      floor: 0,
      cursor: { x: 3, y: 4 },
    });
    room = setPresence(room, editor, {
      view: 'layout',
      floor: 1,
      cursor: { x: 5, y: 6 },
    });
    room = setPresence(room, viewer, {
      view: 'layout',
      floor: 0,
      cursor: null,
    });
    const visible = presenceFor(room, viewer);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({
      participantId: 'owner',
      name: 'Alex',
      cursor: { x: 3, y: 4 },
    });
    expect(visible[0]?.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(room.revision).toBe(0);
    expect(
      roomView(room, viewer).participants.editor?.presence.cursor,
    ).toBeNull();
  });
  it('lets a viewer opt into following and escape restores their own view', () => {
    let room = setPresence(fixture(), owner, {
      view: 'layout',
      floor: 2,
      cursor: null,
    });
    room = setPresence(room, viewer, {
      view: 'production',
      floor: 0,
      cursor: null,
    });
    room = setPresenter(room, owner, true);
    expect(room.participants.viewer?.presence.view).toBe('production');
    room = followPresenter(room, viewer, true);
    expect(room.participants.viewer?.presence).toMatchObject({
      view: 'layout',
      floor: 2,
      following: true,
    });
    room = setPresence(room, owner, { view: 'layout', floor: 3, cursor: null });
    expect(room.participants.viewer?.presence.floor).toBe(3);
    room = followPresenter(room, viewer, false);
    expect(room.participants.viewer?.presence).toMatchObject({
      view: 'production',
      floor: 0,
      following: false,
    });
    expect(() => setPresenter(room, viewer, true)).toThrow(/forbidden/);
  });
  it('presenter departure releases followers and validates presence', () => {
    let room = setPresenter(fixture(), editor, true);
    room = followPresenter(room, viewer, true);
    room = setPresenter(room, editor, false);
    expect(room.presenterId).toBeNull();
    expect(room.participants.viewer?.presence.following).toBe(false);
    expect(() =>
      setPresence(room, viewer, { view: 'layout', floor: -1, cursor: null }),
    ).toThrow(/invalid-presence/);
  });
});
