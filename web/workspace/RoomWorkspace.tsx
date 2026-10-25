import { useEffect, useRef, useState } from 'react';
import { Workspace } from './Workspace';
import { getRoomClient, openRoom, roomError } from './room-client';
import {
  browserRoomStorage,
  outputLabel,
  rememberRoom,
  roomUrl,
} from './recent-rooms';
import { roomApi, type Membership, type RoomPlan } from '../../src/room-api';
import type { SharedPlan } from '../../src/domain/shared-plan';
import { RoomHistory } from './RoomHistory';

export function RoomWorkspace({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<RoomPlan | null>(null),
    [member, setMember] = useState<Membership | null>(null),
    [share, setShare] = useState('');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(false),
    [history, setHistory] = useState(false),
    [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const own = ++generation.current;
    let active = true;
    let stop = () => {},
      stopConnection = () => {};
    setRoom(null);
    setMember(null);
    setError('');
    async function start() {
      try {
        const key =
          new URLSearchParams(window.location.hash.slice(1)).get('key') ?? '';
        const url = roomUrl(window.location.origin, roomId, key);
        setShare(url);
        const client = await getRoomClient();
        if (!active) return;
        setOnline(client.connectionState().isWebSocketConnected);
        stopConnection = client.subscribeToConnectionState((state) => {
          if (active) setOnline(state.isWebSocketConnected);
        });
        void openRoom(roomId, key)
          .then(({ member: joined, state }) => {
            if (!active || generation.current !== own) return;
            setMember(joined);
            setRoom(state);
            const remember = (next: RoomPlan) => {
              const saved = rememberRoom(browserRoomStorage, {
                roomId,
                shareSecret: key,
                label: outputLabel(next.plan),
                visitedAt: Date.now(),
              });
              if (!saved)
                setNotice(
                  'Dieser Browser kann den Raum nicht für spätere Besuche speichern. Bewahre den Raum-Link auf.',
                );
            };
            remember(state);
            stop = client.onUpdate(
              roomApi.view,
              { roomId, capability: joined.capability },
              (next) => {
                if (!active) return;
                setRoom((current) =>
                  !current || next.revision >= current.revision
                    ? next
                    : current,
                );
                remember(next);
                setError('');
              },
              (e) => {
                if (active) setError(roomError(e));
              },
            );
          })
          .catch((e) => {
            if (active) setError(roomError(e));
          });
      } catch (e) {
        if (active) setError(roomError(e));
      }
    }
    void start();
    return () => {
      active = false;
      generation.current++;
      stop();
      stopConnection();
    };
  }, [roomId, attempt]);
  async function edit(plan: SharedPlan, expectedRevision: number) {
    if (!member || !room || busy)
      throw new Error('Der Raum ist noch nicht bereit.');
    if (!online)
      throw new Error(
        'Verbindung unterbrochen. Die Änderung wurde nicht gespeichert.',
      );
    const own = generation.current;
    setBusy(true);
    try {
      const client = await getRoomClient();
      await client.mutation(roomApi.edit, {
        roomId,
        capability: member.capability,
        id: crypto.randomUUID(),
        expectedRevision,
        plan,
      });
      const next = await client.query(roomApi.view, {
        roomId,
        capability: member.capability,
      });
      if (own === generation.current)
        setRoom((current) =>
          !current || next.revision >= current.revision ? next : current,
        );
    } catch (e) {
      throw new Error(roomError(e));
    } finally {
      if (own === generation.current) setBusy(false);
    }
  }
  async function copy() {
    setNotice('');
    try {
      await navigator.clipboard.writeText(share);
      setNotice('Raum-Link kopiert.');
    } catch {
      setNotice('Kopiere den Raum-Link aus dem Link-Feld.');
    }
  }
  if (!room || !member)
    return (
      <main className="room-entry">
        <h1>Satispire</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => setAttempt((n) => n + 1)}>
              Erneut verbinden
            </button>
            <a href="/">Zur Raumübersicht</a>
          </>
        ) : (
          <p role="status">Raum wird geöffnet …</p>
        )}
      </main>
    );
  return (
    <>
      <Workspace
        key={roomId}
        shared={{
          plan: room.plan,
          revision: room.revision,
          busy,
          onEdit: edit,
          controls: (
            <>
              <span role="status" className="room-connection">
                {busy
                  ? 'Wird gespeichert …'
                  : online
                    ? 'Verbunden'
                    : 'Verbindung unterbrochen'}
              </span>
              <button onClick={() => void copy()}>Teilen</button>
              <button
                aria-expanded={history}
                onClick={() => setHistory((v) => !v)}
              >
                Historie
              </button>
              <a href="/" title="Raumübersicht">
                Räume
              </a>
            </>
          ),
        }}
      />
      {error && (
        <p role="alert" className="room-notice">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="room-notice">
          {notice}
        </p>
      )}
      <label className="room-link">
        Raum-Link
        <input
          aria-label="Raum-Link"
          readOnly
          value={share}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      {history && (
        <RoomHistory
          member={member}
          revision={room.revision}
          online={online && !busy}
          close={() => setHistory(false)}
        />
      )}
    </>
  );
}
