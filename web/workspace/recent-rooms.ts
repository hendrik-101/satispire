import { z } from 'zod';
import { itemName } from '../../src/domain/vanilla';
import type { SharedPlan } from '../../src/domain/shared-plan';
import type { Membership } from '../../src/room-api';
import type { UnlockStorage } from './unlock-storage';
const idSchema = z.string().uuid();
const secretSchema = z.string().regex(/^[a-f0-9]{64}$/);
const recentSchema = z.object({
  roomId: idSchema,
  shareSecret: secretSchema,
  label: z.string().min(1).max(1000),
  visitedAt: z.number().finite(),
});
export type RecentRoom = z.infer<typeof recentSchema>;
const KEY = 'satispire.recent-rooms.v1';
export const browserRoomStorage: UnlockStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
export function roomUrl(origin: string, roomId: string, shareSecret: string) {
  return new URL(
    `/room/${idSchema.parse(roomId)}#key=${secretSchema.parse(shareSecret)}`,
    origin,
  ).href;
}
export function outputLabel(plan: SharedPlan) {
  return (
    plan.production.targets
      .map((t) => `${t.rate} ${itemName(t.itemId)}/min`)
      .join(' · ')
      .slice(0, 1000) || 'Neuer Raum'
  );
}
export function readRecentRooms(storage: UnlockStorage): RecentRoom[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw || raw.length > 100_000) return [];
    const parsed = z.array(recentSchema).max(30).parse(JSON.parse(raw));
    return parsed.sort((a, b) => b.visitedAt - a.visitedAt);
  } catch {
    return [];
  }
}
export function rememberRoom(storage: UnlockStorage, room: RecentRoom) {
  try {
    const next = [
      recentSchema.parse(room),
      ...readRecentRooms(storage).filter((r) => r.roomId !== room.roomId),
    ].slice(0, 30);
    storage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
const memberSchema = z.object({
  roomId: idSchema,
  participantId: z.string().min(1).max(128),
  capability: secretSchema,
});
export function readMembership(
  storage: UnlockStorage,
  roomId: string,
): Membership | null {
  try {
    const raw = storage.getItem(
      'satispire.membership.v1:' + idSchema.parse(roomId),
    );
    if (!raw || raw.length > 1000) return null;
    const member = memberSchema.parse(JSON.parse(raw));
    return member.roomId === roomId ? member : null;
  } catch {
    return null;
  }
}
export function storeMembership(storage: UnlockStorage, member: Membership) {
  try {
    storage.setItem(
      'satispire.membership.v1:' + memberSchema.parse(member).roomId,
      JSON.stringify(member),
    );
    return true;
  } catch {
    return false;
  }
}
