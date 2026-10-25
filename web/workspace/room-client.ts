import { ConvexClient } from 'convex/browser';
import { roomApi, type Membership, type RoomPlan } from '../../src/room-api';
import {
  browserRoomStorage,
  readMembership,
  storeMembership,
} from './recent-rooms';

let client: ConvexClient | undefined;
const volatileMembers = new Map<string, Membership>();
let preparing: Promise<ConvexClient> | undefined;
export function getRoomClient(): Promise<ConvexClient> {
  if (client) return Promise.resolve(client);
  return (preparing ??= prepare().catch((error) => {
    preparing = undefined;
    throw error;
  }));
}
async function prepare() {
  let url = import.meta.env.VITE_CONVEX_URL as string | undefined;
  if (!url) {
    try {
      const response = await fetch('/config.json', { cache: 'no-store' });
      if (response.ok) {
        const config = await response.json();
        if (typeof config.convexUrl === 'string') url = config.convexUrl;
      }
    } catch {
      /* An unconfigured Vite workspace remains explicitly local. */
    }
  }
  if (!url) throw new Error('Online-Räume sind derzeit nicht verfügbar.');
  return (client ??= new ConvexClient(url, { logger: false }));
}
export function roomError(error: unknown) {
  const detail = error instanceof Error ? error.message : '';
  if (detail.includes('undo-conflict'))
    return 'Diese Änderung kann wegen späterer Änderungen nicht rückgängig gemacht werden.';
  if (detail.includes('revision-conflict'))
    return 'Der Raum wurde inzwischen geändert. Dein Entwurf bleibt erhalten. Bitte prüfe den aktuellen Stand und versuche es erneut.';
  if (detail.includes('forbidden'))
    return 'Kein Zugriff auf diesen Raum. Bitte prüfe den Raum-Link.';
  if (detail.includes('Online-Räume')) return detail;
  return 'Der Raum konnte nicht aktualisiert werden. Bitte prüfe die Verbindung und versuche es erneut.';
}
export function keepMembership(member: Membership) {
  volatileMembers.set(member.roomId, member);
  return storeMembership(browserRoomStorage, member);
}
export async function openRoom(
  roomId: string,
  shareSecret: string,
): Promise<{ member: Membership; state: RoomPlan }> {
  const c = await getRoomClient();
  const saved =
    volatileMembers.get(roomId) ?? readMembership(browserRoomStorage, roomId);
  if (saved) {
    try {
      return {
        member: saved,
        state: await c.query(roomApi.view, {
          roomId,
          capability: saved.capability,
        }),
      };
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('forbidden'))
        throw error;
    }
  }
  const member = await c.action(roomApi.join, {
    roomId,
    shareSecret,
    name: 'Mitspieler',
  });
  keepMembership(member);
  return {
    member,
    state: await c.query(roomApi.view, {
      roomId,
      capability: member.capability,
    }),
  };
}
