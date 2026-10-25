import { expect, it } from 'vitest';
import {
  roomUrl,
  readRecentRooms,
  rememberRoom,
  outputLabel,
  readMembership,
  storeMembership,
} from '../web/workspace/recent-rooms';
import { initialSharedPlan } from '../src/domain/shared-plan';
const storage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
};
const id = '172be3fe-e426-46c2-84f4-765639fcebee';
const secret = 'a'.repeat(64);
it('uses canonical URLs and displays outputs rather than identifiers', () => {
  expect(roomUrl('https://example.org', id, secret)).toBe(
    `https://example.org/room/${id}#key=${secret}`,
  );
  expect(outputLabel(initialSharedPlan())).toContain('20');
  expect(outputLabel(initialSharedPlan())).toContain('Eisenplatte');
  expect(() => roomUrl('https://example.org', '../escape', secret)).toThrow();
});
it('deduplicates and sorts recent rooms while keeping membership separate', () => {
  const s = storage();
  rememberRoom(s, {
    roomId: id,
    shareSecret: secret,
    label: '20 Iron Plate/min',
    visitedAt: 1,
  });
  rememberRoom(s, {
    roomId: id,
    shareSecret: secret,
    label: '40 Iron Plate/min',
    visitedAt: 2,
  });
  expect(readRecentRooms(s)).toEqual([
    {
      roomId: id,
      shareSecret: secret,
      label: '40 Iron Plate/min',
      visitedAt: 2,
    },
  ]);
  const member = {
    roomId: id,
    participantId: 'owner',
    capability: 'b'.repeat(64),
  };
  storeMembership(s, member);
  expect(readMembership(s, id)).toEqual(member);
  expect(JSON.stringify(readRecentRooms(s))).not.toContain(member.capability);
});
it('recovers from corrupt or disabled browser storage and validates stored routes', () => {
  const s = storage();
  s.setItem('satispire.recent-rooms.v1', '[{"roomId":"../escape"}]');
  expect(readRecentRooms(s)).toEqual([]);
  const blocked = {
    getItem: () => {
      throw Error('blocked');
    },
    setItem: () => {
      throw Error('blocked');
    },
  };
  expect(readRecentRooms(blocked)).toEqual([]);
  expect(readMembership(blocked, id)).toBeNull();
  expect(
    rememberRoom(blocked, {
      roomId: id,
      shareSecret: secret,
      label: '20 Iron Plate/min',
      visitedAt: 1,
    }),
  ).toBe(false);
});
