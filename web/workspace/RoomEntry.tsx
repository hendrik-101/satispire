import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import {
  getRoomClient,
  keepMembership,
  openRoom,
  roomError,
} from './room-client';
import {
  browserRoomStorage,
  outputLabel,
  readRecentRooms,
  rememberRoom,
  roomUrl,
  type RecentRoom,
} from './recent-rooms';
import { initialSharedPlan } from '../../src/domain/shared-plan';
import { roomApi } from '../../src/room-api';
import { createUnlockProfile } from '../../src/domain/session-unlocks';
import { loadUnlockProfile } from './unlock-storage';
import { availableChoices } from '../../src/domain/vanilla';

export function RoomEntry() {
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [rooms, setRooms] = useState<RecentRoom[]>([]),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    const recent = readRecentRooms(browserRoomStorage);
    setRooms(recent);
    let active = true;
    for (const room of recent) {
      void openRoom(room.roomId, room.shareSecret)
        .then(({ state }) => {
          if (!active) return;
          const updated = { ...room, label: outputLabel(state.plan) };
          rememberRoom(browserRoomStorage, updated);
          setRooms((current) =>
            current.map((r) => (r.roomId === room.roomId ? updated : r)),
          );
        })
        .catch(() => {
          /* Cached output labels remain usable during a temporary outage. */
        });
    }
    return () => {
      active = false;
    };
  }, []);
  async function create() {
    setPending(true);
    setError('');
    try {
      let plan = initialSharedPlan();
      const unlocks = loadUnlockProfile(
        { getItem: () => null, setItem: () => {} },
        browserRoomStorage,
        { roomId: 'new', participantId: 'creator' },
      );
      // A browser preset seeds only a newly created room.
      if (JSON.stringify(unlocks) !== JSON.stringify(createUnlockProfile())) {
        const recipes = availableChoices(unlocks.technology);
        const itemId = recipes[plan.production.targets[0]!.itemId]
          ? plan.production.targets[0]!.itemId
          : Object.keys(recipes)[0];
        if (!itemId) throw new Error('no-target');
        plan = {
          ...plan,
          unlocks,
          production: {
            ...plan.production,
            recipes,
            technology: unlocks.technology,
            targets: [{ itemId, rate: '20' }],
          },
        };
      }
      const member = await (
        await getRoomClient()
      ).action(roomApi.create, {
        name: 'Ersteller',
        plan,
      });
      keepMembership(member);
      rememberRoom(browserRoomStorage, {
        roomId: member.roomId,
        shareSecret: member.shareSecret,
        label: outputLabel(plan),
        visitedAt: Date.now(),
      });
      await navigate({
        to: '/room/$roomId',
        params: { roomId: member.roomId },
        hash: 'key=' + member.shareSecret,
      });
    } catch (e) {
      setError(roomError(e));
      setPending(false);
    }
  }
  return (
    <main className="room-entry">
      <h1>Satispire</h1>
      <dialog
        ref={dialog}
        className="room-entry-dialog"
        aria-labelledby="room-entry-title"
        onCancel={(e) => e.preventDefault()}
      >
        <h2 id="room-entry-title">Deine Räume</h2>
        <p>Zuletzt besuchte Produktionen</p>
        {rooms.length ? (
          <ul className="recent-rooms">
            {rooms.map((room) => (
              <li key={room.roomId}>
                <a
                  href={roomUrl(
                    typeof window === 'undefined'
                      ? 'http://localhost'
                      : window.location.origin,
                    room.roomId,
                    room.shareSecret,
                  )}
                >
                  <strong>{room.label}</strong>
                  <span>Raum wieder beitreten</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>Noch keine Räume besucht.</p>
        )}
        {error && (
          <>
            <p role="alert">{error}</p>
            <a href="/local">Lokal weiterplanen</a>
          </>
        )}
        <button type="button" disabled={pending} onClick={() => void create()}>
          {pending ? 'Raum wird erstellt …' : 'Neuen Raum starten'}
        </button>
      </dialog>
    </main>
  );
}
