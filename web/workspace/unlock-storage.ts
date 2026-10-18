import {
  createUnlockProfile,
  validateUnlockProfile,
  type UnlockProfile,
} from '../../src/domain/session-unlocks.js';
import type { RoomContext } from '../../src/domain/rooms.js';

export interface UnlockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
function keys(context: Pick<RoomContext, 'roomId'>) {
  return {
    session: 'satispire.unlocks.session.v1:' + JSON.stringify(context.roomId),
    browser: 'satispire.unlocks.browser.v1',
  };
}
export function loadUnlockProfile(
  session: UnlockStorage,
  browser: UnlockStorage,
  context: RoomContext,
): UnlockProfile {
  const key = keys(context);
  for (const [storage, name] of [
    [session, key.session],
    [browser, key.browser],
  ] as const) {
    try {
      const raw = storage.getItem(name);
      if (raw && raw.length <= 1_000_000)
        return validateUnlockProfile(JSON.parse(raw));
    } catch {
      /* An invalid session must not mask a valid browser profile. */
    }
  }
  return createUnlockProfile();
}
export function saveUnlockProfile(
  session: UnlockStorage,
  browser: UnlockStorage,
  context: RoomContext,
  profile: UnlockProfile,
): { session: boolean; browser: boolean } {
  const key = keys(context);
  const raw = JSON.stringify(validateUnlockProfile(profile));
  const result = { session: false, browser: false };
  for (const [storage, name, field] of [
    [session, key.session, 'session'],
    [browser, key.browser, 'browser'],
  ] as const) {
    try {
      storage.setItem(name, raw);
      result[field] = true;
    } catch {
      /* Keep the in-memory profile usable when storage is unavailable. */
    }
  }
  return result;
}
