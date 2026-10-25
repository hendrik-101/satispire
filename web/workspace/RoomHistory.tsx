import { useEffect, useRef, useState } from 'react';
import {
  roomApi,
  type HistoryEntry,
  type Membership,
} from '../../src/room-api';
import { getRoomClient, roomError } from './room-client';
export function RoomHistory({
  member,
  revision,
  online,
  close,
}: {
  member: Membership;
  revision: number;
  online: boolean;
  close: () => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [done, setDone] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const own = ++generation.current;
    setEntries([]);
    setError('');
    void getRoomClient()
      .then((client) =>
        client.query(roomApi.history, {
          roomId: member.roomId,
          capability: member.capability,
          paginationOpts: { numItems: 20, cursor: null },
        }),
      )
      .then((result) => {
        if (generation.current !== own) return;
        setEntries(result.page);
        setCursor(result.continueCursor);
        setDone(result.isDone);
      })
      .catch((e) => {
        if (generation.current === own) setError(roomError(e));
      });
    return () => {
      generation.current++;
    };
  }, [member, revision]);
  async function more() {
    const own = generation.current;
    setBusy(true);
    try {
      const result = await (
        await getRoomClient()
      ).query(roomApi.history, {
        roomId: member.roomId,
        capability: member.capability,
        paginationOpts: { numItems: 20, cursor },
      });
      if (generation.current !== own) return;
      setEntries((current) => [
        ...current,
        ...result.page.filter((e) => !current.some((c) => c.id === e.id)),
      ]);
      setCursor(result.continueCursor);
      setDone(result.isDone);
    } catch (e) {
      if (generation.current === own) setError(roomError(e));
    } finally {
      setBusy(false);
    }
  }
  async function undo(entryId: string) {
    setBusy(true);
    setError('');
    try {
      await (
        await getRoomClient()
      ).mutation(roomApi.undo, {
        roomId: member.roomId,
        capability: member.capability,
        id: crypto.randomUUID(),
        expectedRevision: revision,
        entryId,
      });
    } catch (e) {
      setError(roomError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="room-history" aria-label="Änderungshistorie">
      <div className="room-history-heading">
        <h2>Historie</h2>
        <button onClick={close} aria-label="Historie schließen">
          ×
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!entries.length && !error && <p>Noch keine Änderungen.</p>}
      <ol>
        {entries.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.summary}</strong>
            <span>
              {entry.author} ·{' '}
              {new Date(entry.timestamp).toLocaleString('de-DE')} · Stand{' '}
              {entry.revision}
            </span>
            <button
              disabled={busy || !online}
              onClick={() => void undo(entry.id)}
              aria-label={`Änderung ${entry.revision} rückgängig machen`}
            >
              Rückgängig
            </button>
          </li>
        ))}
      </ol>
      {!done && (
        <button disabled={busy || !online} onClick={() => void more()}>
          Ältere Änderungen laden
        </button>
      )}
    </aside>
  );
}
