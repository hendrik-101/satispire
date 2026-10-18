import { expect, it } from 'vitest';
import {
  createUnlockProfile,
  validateUnlockProfile,
} from '../src/domain/session-unlocks.js';
import {
  loadUnlockProfile,
  saveUnlockProfile,
} from '../web/workspace/unlock-storage.js';
import {
  createRoom,
  createInvite,
  joinRoom,
  applyRoomCommand,
  roomView,
} from '../src/domain/rooms.js';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
const owner = { roomId: 'local', participantId: 'owner' };

it('maps completed elevator phases to HUB tiers while allowing explicit custom unlocks', () => {
  expect(createUnlockProfile(2).spaceElevatorPhase).toBe(0);
  expect(createUnlockProfile(9).spaceElevatorPhase).toBe(4);
  expect(() => createUnlockProfile(9, 0)).toThrow();
  const profile = createUnlockProfile(2);
  profile.hubTier = null;
  profile.technology.availableMachines.push('Desc_FoundryMk1_C');
  expect(validateUnlockProfile(profile)).toEqual(profile);
  expect(() =>
    validateUnlockProfile({ ...profile, spaceElevatorPhase: 6 }),
  ).toThrow();
  expect(() =>
    validateUnlockProfile({
      ...profile,
      technology: { ...profile.technology, unlockedRecipes: ['unknown'] },
    }),
  ).toThrow();
});

it('restores session settings before browser defaults and isolates rooms', () => {
  const session = storage();
  const browser = storage();
  saveUnlockProfile(session, browser, owner, createUnlockProfile(4));
  const secondSession = storage();
  saveUnlockProfile(secondSession, browser, owner, createUnlockProfile(7));
  expect(loadUnlockProfile(session, browser, owner)).toEqual(
    createUnlockProfile(4),
  );
  expect(loadUnlockProfile(storage(), browser, owner)).toEqual(
    createUnlockProfile(7),
  );
  expect(
    loadUnlockProfile(session, browser, { ...owner, participantId: 'other' }),
  ).toEqual(createUnlockProfile(4));
  expect(
    loadUnlockProfile(session, browser, { ...owner, roomId: 'other' }),
  ).toEqual(createUnlockProfile(7));
});

it('recovers from corrupt, incompatible or unavailable storage independently', () => {
  const browser = storage();
  const session = storage();
  saveUnlockProfile(session, browser, owner, createUnlockProfile(5));
  const corrupt = {
    getItem: () => '{',
    setItem: () => {
      throw new Error('quota');
    },
  };
  expect(loadUnlockProfile(corrupt, browser, owner)).toEqual(
    createUnlockProfile(5),
  );
  expect(
    saveUnlockProfile(corrupt, browser, owner, createUnlockProfile(6)),
  ).toEqual({ session: false, browser: true });
  expect(loadUnlockProfile(storage(), browser, owner)).toEqual(
    createUnlockProfile(6),
  );
  const outdated = {
    getItem: () => JSON.stringify({ schemaVersion: 99 }),
    setItem: () => {},
  };
  expect(loadUnlockProfile(outdated, outdated, owner)).toEqual(
    createUnlockProfile(2),
  );
});

it('seeds shared settings from the creator and lets every participant change them', () => {
  const original = createUnlockProfile(7);
  let room = createRoom({
    roomId: owner.roomId,
    ownerId: owner.participantId,
    ownerName: 'Owner',
    unlocks: original,
  });
  original.technology.availableMachines.length = 0;
  expect(room.unlocks).toEqual(createUnlockProfile(7));
  room = createInvite(room, owner, {
    id: 'invite',
    digest: 'join',
    role: 'viewer',
  });
  room = joinRoom(room, 'join', { id: 'viewer', name: 'Viewer' });
  const viewer = { ...owner, participantId: 'viewer' };
  expect(roomView(room, viewer).unlocks).toEqual(createUnlockProfile(7));
  const command = {
    id: 'unlocks',
    expectedRevision: 0,
    command: { type: 'set-unlocks' as const, profile: createUnlockProfile(2) },
  };
  const next = applyRoomCommand(room, viewer, command).room;
  expect(roomView(next, owner).unlocks).toEqual(createUnlockProfile(2));
  expect(roomView(next, viewer).unlocks).toEqual(createUnlockProfile(2));
  expect(room.unlocks).toEqual(createUnlockProfile(7));
  expect(next.revision).toBe(1);
  expect(applyRoomCommand(next, viewer, command).duplicate).toBe(true);
  expect(() =>
    applyRoomCommand(next, owner, { ...command, id: 'stale' }),
  ).toThrow(/revision-conflict/);
  expect(() =>
    applyRoomCommand(next, { ...owner, participantId: 'stranger' }, command),
  ).toThrow(/forbidden/);
});
