import {
  HttpSessionClient,
  RetryableHttpSessionError,
  type SessionClient,
} from './http-session-client.js';
import { ConvexClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { planFileSchema } from '../../src/plan-file.js';
import type {
  SessionMembership,
  SessionPlan,
  SessionPresence,
  SessionPresenceInput,
  SessionSnapshot,
} from '../../src/session-plan.js';

export type SessionMode = 'local' | 'online';
export interface SessionStatus {
  mode: SessionMode;
  state:
    | 'connecting'
    | 'ready'
    | 'saving'
    | 'saved'
    | 'conflict'
    | 'error'
    | 'storage-error';
  message: string;
  sessionId: string | null;
  link: string | null;
  revision: number | null;
}
export interface SessionController {
  readonly sessionId: string | null;
  readonly link: string | null;
  readonly mode: SessionMode;
  start(): Promise<SessionSnapshot>;
  commit(plan: SessionPlan): Promise<void>;
  setPresence(input: SessionPresenceInput): void;
  close(): void;
}
interface Options {
  initialPlan: SessionPlan;
  onSnapshot(snapshot: SessionSnapshot): void;
  onStatus(status: SessionStatus): void;
  onPresence(peers: SessionPresence[]): void;
  convexUrl?: string;
  name?: string;
}
const createRef = makeFunctionReference<
  'action',
  { plan: SessionPlan; name: string },
  SessionMembership
>('sessions:create');
const joinRef = makeFunctionReference<
  'action',
  { sessionId: string; name: string },
  SessionMembership
>('sessions:join');
type Auth = { sessionId: string; capability: string };
const readRef = makeFunctionReference<'query', Auth, SessionSnapshot>(
  'sessions:read',
);
const commitRef = makeFunctionReference<
  'mutation',
  Auth & { id: string; expectedRevision: number; plan: SessionPlan },
  { revision: number; duplicate: boolean }
>('sessions:commit');
const presenceRef = makeFunctionReference<
  'mutation',
  Auth & {
    clientId: string;
    view: SessionPresenceInput['view'];
    floor: string;
    cursor: SessionPresenceInput['cursor'];
  },
  null
>('sessions:presence');
const peersRef = makeFunctionReference<
  'query',
  Auth & { view: SessionPresenceInput['view']; floor: string },
  SessionPresence[]
>('sessions:peers');
const prefix = 'satispire.session.';
const validId = (id: string) => /^[a-f0-9]{64}$/.test(id);
const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
function snapshotFrom(value: unknown): SessionSnapshot {
  const s = value as Partial<SessionSnapshot> | null;
  if (!s || !Number.isSafeInteger(s.revision) || s.revision! < 0)
    throw new Error('Ungültiger gespeicherter Sitzungsstand.');
  return { revision: s.revision!, plan: planFileSchema.parse(s.plan) };
}
function configuredUrl(): string | undefined {
  return (import.meta as ImportMeta & { env?: { VITE_CONVEX_URL?: string } })
    .env?.VITE_CONVEX_URL;
}

/** Owns browser persistence and revision ordering; no solver or layout work occurs here. */
export function createSessionController(options: Options): SessionController {
  const convexUrl = options.convexUrl ?? configuredUrl();
  let mode: SessionMode = convexUrl ? 'online' : 'local';
  let storageMode: string = mode;
  let http = false;
  let discovery: AbortController | null = null;
  let sessionId: string | null = null;
  let link: string | null = null;
  let snapshot: SessionSnapshot | null = null;
  let writeRevision = 0;
  let client: SessionClient | null = null;
  let membership: SessionMembership | null = null;
  let closed = false;
  let connected = mode === 'local';
  let started: Promise<SessionSnapshot> | null = null;
  let storageFailed = false;
  let failure: Error | null = null;
  let pending = 0;
  let queue = Promise.resolve();
  let cancelRetry: (() => void) | null = null;
  let deferredSnapshot: SessionSnapshot | null = null;
  const clientId = crypto.randomUUID();
  const unsubscribers: (() => void)[] = [];
  let unsubscribePeers: (() => void) | null = null;
  let presence: SessionPresenceInput | null = null;
  let peerList: SessionPresence[] = [];
  let lastPresenceSent = -Infinity;
  let presenceTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let peerExpiry: ReturnType<typeof setTimeout> | null = null;
  const status = (state: SessionStatus['state'], message: string) => {
    if (!closed)
      options.onStatus({
        mode,
        state,
        message,
        sessionId,
        link,
        revision: snapshot?.revision ?? null,
      });
  };
  const ready = () => {
    if (mode === 'online' && !connected) {
      status(
        'connecting',
        'Verbindung unterbrochen · Speicherung wird geprüft',
      );
    } else if (storageFailed) {
      status(
        'storage-error',
        mode === 'local'
          ? 'Browser-Speicher nicht verfügbar. Änderungen sind nicht dauerhaft gespeichert.'
          : 'Online gespeichert · Browser kann den Sitzungszugang nicht speichern.',
      );
    } else {
      status(
        'saved',
        mode === 'local'
          ? 'In diesem Browser gespeichert · Link nur lokal verfügbar'
          : 'Online gespeichert',
      );
    }
  };
  const fail = (error: unknown) => {
    const e =
      error instanceof Error ? error : new Error('Sitzung nicht erreichbar.');
    if (failure && e !== failure) return e;
    if (pending && e instanceof RetryableHttpSessionError) {
      status(
        'connecting',
        'Änderungen noch nicht gespeichert · Verbindung wird wiederhergestellt …',
      );
      return e;
    }
    status(
      /conflict/.test(e.message) ? 'conflict' : 'error',
      /conflict/.test(e.message)
        ? 'Änderungskonflikt. Entwurf bleibt erhalten; Sitzung zum Abgleichen neu laden.'
        : e.message,
    );
    return e;
  };
  const getStored = (key: string): string | null => {
    try {
      return window.localStorage.getItem(prefix + key);
    } catch {
      storageFailed = true;
      return null;
    }
  };
  const putStored = (key: string, value: unknown): boolean => {
    try {
      window.localStorage.setItem(prefix + key, JSON.stringify(value));
      return true;
    } catch {
      storageFailed = true;
      return false;
    }
  };
  const auth = (): Auth => {
    if (!membership) throw new Error('Sitzung ist noch nicht bereit.');
    return {
      sessionId: membership.sessionId,
      capability: membership.capability,
    };
  };
  const publish = (next: SessionSnapshot) => {
    if (closed || failure || (snapshot && next.revision <= snapshot.revision))
      return;
    snapshot = next;
    options.onSnapshot(next);
  };
  const receive = (next: SessionSnapshot) => {
    if (closed || failure || (snapshot && next.revision <= snapshot.revision))
      return;
    if (pending) {
      if (!deferredSnapshot || next.revision > deferredSnapshot.revision)
        deferredSnapshot = next;
      return;
    }
    writeRevision = next.revision;
    publish(next);
  };
  const filterPeers = () => {
    if (closed) return;
    const fresh = peerList.filter(
      (p) =>
        p.clientId !== clientId &&
        p.cursor !== null &&
        p.updatedAt > Date.now() - 15000 &&
        p.view === presence?.view &&
        p.floor === presence?.floor,
    );
    options.onPresence(fresh);
    if (peerExpiry) clearTimeout(peerExpiry);
    peerExpiry = fresh.length
      ? setTimeout(
          filterPeers,
          Math.max(
            1,
            Math.min(...fresh.map((p) => p.updatedAt + 15000)) - Date.now(),
          ),
        )
      : null;
  };
  const sendPresence = () => {
    presenceTimer = null;
    if (closed || !client || !membership || !presence) return;
    lastPresenceSent = Date.now();
    void client
      .mutation(presenceRef, { ...auth(), clientId, ...presence })
      .catch(() => {
        // Presence is ephemeral. Connection status reports connectivity; heartbeat retries it.
      });
  };
  const clearPresence = () => {
    if (!presence) return;
    presence = { ...presence, cursor: null };
    if (presenceTimer) clearTimeout(presenceTimer);
    presenceTimer = null;
    sendPresence();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') clearPresence();
  };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (pending > 0) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  const subscribePeers = () => {
    if (!client || !membership || !presence) return;
    const scope = { view: presence.view, floor: presence.floor };
    unsubscribePeers?.();
    unsubscribePeers = client.onUpdate(
      peersRef,
      { ...auth(), ...scope },
      (peers) => {
        if (presence?.view !== scope.view || presence.floor !== scope.floor)
          return;
        peerList = peers;
        filterPeers();
      },
      fail,
    );
  };
  const onStorage = (event: StorageEvent) => {
    if (
      mode !== 'local' ||
      event.key !== prefix + 'local.' + sessionId ||
      !event.newValue
    )
      return;
    try {
      receive(snapshotFrom(JSON.parse(event.newValue)));
    } catch (e) {
      fail(e);
    }
  };
  const setUrl = (id: string) => {
    sessionId = id;
    const url = new URL(window.location.href);
    url.searchParams.set('session', id);
    // Clear fragments so no older transport's credential can be copied accidentally.
    url.hash = '';
    link = url.href;
    window.history.replaceState(null, '', link);
  };
  const retryAfter = (delay: number) =>
    new Promise<void>((resolve, reject) => {
      if (closed) {
        reject(new Error('Sitzung wurde geschlossen.'));
        return;
      }
      const timer = setTimeout(() => {
        cancelRetry = null;
        resolve();
      }, delay);
      cancelRetry = () => {
        clearTimeout(timer);
        cancelRetry = null;
        reject(new Error('Sitzung wurde geschlossen.'));
      };
    });
  const commitOnline = async (plan: SessionPlan) => {
    // Reuse the complete command after an uncertain acknowledgement. The backend's
    // receipt recognizes an already applied write before checking its old revision.
    const command = {
      ...auth(),
      id: crypto.randomUUID(),
      expectedRevision: writeRevision,
      plan,
    };
    let attempt = 0;
    for (;;) {
      if (closed) throw new Error('Sitzung wurde geschlossen.');
      try {
        return await client!.mutation(commitRef, command);
      } catch (error) {
        if (closed || !http || !(error instanceof RetryableHttpSessionError))
          throw error;
        fail(error);
        await retryAfter(Math.min(5000, 250 * 2 ** Math.min(attempt++, 5)));
      }
    }
  };
  const start = async (): Promise<SessionSnapshot> => {
    status(
      'connecting',
      mode === 'local'
        ? 'Lokale Sitzung wird geladen …'
        : 'Online-Sitzung wird verbunden …',
    );
    try {
      if (closed) throw new Error('Sitzung wurde geschlossen.');
      if (convexUrl) {
        const url = new URL(convexUrl);
        if (
          url.protocol !== 'https:' &&
          !(
            url.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
          )
        )
          throw new Error(
            'Convex benötigt HTTPS oder eine lokale Loopback-Adresse.',
          );
        if (url.username || url.password || url.search || url.hash)
          throw new Error('Ungültige öffentliche Convex-URL.');
      }
      if (!convexUrl) {
        discovery = new AbortController();
        const timeout = setTimeout(() => discovery?.abort(), 2000);
        try {
          const response = await fetch('/api/session-config', {
            method: 'GET',
            credentials: 'same-origin',
            redirect: 'error',
            cache: 'no-store',
            signal: discovery.signal,
          });
          if (response.status !== 404) {
            if (!response.ok)
              throw new Error(
                'Sitzungsdienst nicht erreichbar (' + response.status + ').',
              );
            let config: unknown = null;
            try {
              config = await response.json();
            } catch (e) {
              if (discovery.signal.aborted) throw e;
              // Static hosts commonly return their HTML application for unknown API paths.
            }
            http =
              !!config &&
              typeof config === 'object' &&
              'transport' in config &&
              config.transport === 'http';
          }
        } finally {
          clearTimeout(timeout);
          discovery = null;
        }
        if (closed) throw new Error('Sitzung wurde geschlossen.');
        if (http) {
          mode = 'online';
          storageMode = 'online.http';
          connected = false;
          status('connecting', 'Online-Sitzung wird verbunden …');
        }
      }
      const requested = new URL(window.location.href).searchParams.get(
        'session',
      );
      const latest =
        requested === null ? getStored('latest.' + storageMode) : null;
      const latestId = latest ? (JSON.parse(latest) as unknown) : null;
      const id = requested ?? (typeof latestId === 'string' ? latestId : null);
      if (id !== null && !validId(id))
        throw new Error('Ungültiger Sitzungslink.');
      let initial: SessionSnapshot;
      if (mode === 'local') {
        if (id) {
          const stored = getStored('local.' + id);
          if (!stored)
            throw new Error(
              'Diese lokale Sitzung ist in diesem Browser nicht verfügbar.',
            );
          initial = snapshotFrom(JSON.parse(stored));
          setUrl(id);
        } else {
          initial = {
            revision: 0,
            plan: planFileSchema.parse(options.initialPlan),
          };
          setUrl(randomId());
          putStored('local.' + sessionId, initial);
        }
      } else {
        client = http ? new HttpSessionClient() : new ConvexClient(convexUrl!);
        unsubscribers.push(
          client.subscribeToConnectionState((state) => {
            connected = state.isWebSocketConnected;
            if (!failure && !state.isWebSocketConnected)
              status(
                'connecting',
                'Verbindung unterbrochen · Speicherung ausstehend',
              );
            else if (!failure && !pending && snapshot) ready();
          }),
        );
        const stored = id
          ? getStored('member.' + (http ? 'http.' : '') + id)
          : null;
        if (stored) {
          const m = JSON.parse(stored) as SessionMembership;
          if (
            m.sessionId !== id ||
            !validId(m.capability) ||
            typeof m.participantId !== 'string'
          )
            throw new Error('Ungültige lokale Sitzungsberechtigung.');
          membership = m;
        } else {
          const name = options.name ?? 'Gast';
          membership = id
            ? await client.action(joinRef, { sessionId: id, name })
            : await client.action(createRef, {
                plan: options.initialPlan,
                name,
              });
          putStored(
            'member.' + (http ? 'http.' : '') + membership.sessionId,
            membership,
          );
        }
        if (closed) throw new Error('Sitzung wurde geschlossen.');
        setUrl(membership.sessionId);
        initial = snapshotFrom(await client.query(readRef, auth()));
        if (closed) throw new Error('Sitzung wurde geschlossen.');
        unsubscribers.push(client.onUpdate(readRef, auth(), receive, fail));
      }
      if (closed) throw new Error('Sitzung wurde geschlossen.');
      publish(initial);
      writeRevision = snapshot!.revision;
      subscribePeers();
      putStored('latest.' + storageMode, sessionId);
      window.addEventListener('storage', onStorage);
      window.addEventListener('pagehide', clearPresence);
      window.addEventListener('beforeunload', beforeUnload);
      document.addEventListener('visibilitychange', onVisibility);
      heartbeat = setInterval(() => {
        filterPeers();
        if (document.visibilityState !== 'hidden') sendPresence();
      }, 5000);
      ready();
      return snapshot!;
    } catch (e) {
      throw fail(e);
    }
  };
  return {
    get sessionId() {
      return sessionId;
    },
    get link() {
      return link;
    },
    get mode() {
      return mode;
    },
    start() {
      started ??= start();
      return started;
    },
    commit(plan) {
      if (!snapshot || closed)
        return Promise.reject(new Error('Sitzung ist noch nicht bereit.'));
      if (failure) return Promise.reject(failure);
      const value = planFileSchema.parse(plan);
      pending++;
      status(
        'saving',
        mode === 'local' ? 'Im Browser speichern …' : 'Online speichern …',
      );
      const job = queue
        .then(async () => {
          if (failure) throw failure;
          if (closed) throw new Error('Sitzung wurde geschlossen.');
          let next: SessionSnapshot;
          if (client) {
            const result = await commitOnline(value);
            next = { revision: result.revision, plan: value };
          } else {
            const saved = getStored('local.' + sessionId);
            if (
              saved &&
              snapshotFrom(JSON.parse(saved)).revision !== writeRevision
            )
              throw new Error('revision-conflict');
            next = { revision: writeRevision + 1, plan: value };
            putStored('local.' + sessionId, next);
          }
          writeRevision = next.revision;
          publish(next);
        })
        .catch((e: unknown) => {
          failure = fail(e);
          throw failure;
        })
        .finally(() => {
          pending--;
          if (!pending && !failure) {
            if (deferredSnapshot) {
              const next = deferredSnapshot;
              deferredSnapshot = null;
              receive(next);
            }
            ready();
          }
        });
      queue = job.catch(() => {});
      return job;
    },
    setPresence(input) {
      if (closed) return;
      const cursor = input.cursor;
      if (
        input.floor.length > 256 ||
        (cursor && (!Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)))
      )
        return;
      const changedScope =
        presence?.view !== input.view || presence.floor !== input.floor;
      presence = {
        ...input,
        cursor: document.visibilityState === 'hidden' ? null : cursor,
      };
      if (changedScope) {
        peerList = [];
        options.onPresence([]);
        subscribePeers();
      }
      if (!presence.cursor) {
        clearPresence();
        return;
      }
      const delay = Math.max(0, 80 - (Date.now() - lastPresenceSent));
      if (delay === 0) sendPresence();
      else if (!presenceTimer) presenceTimer = setTimeout(sendPresence, delay);
    },
    close() {
      if (closed) return;
      clearPresence();
      closed = true;
      discovery?.abort();
      cancelRetry?.();
      if (presenceTimer) clearTimeout(presenceTimer);
      if (heartbeat) clearInterval(heartbeat);
      if (peerExpiry) clearTimeout(peerExpiry);
      unsubscribePeers?.();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', clearPresence);
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      options.onPresence([]);
      void client?.close();
    },
  };
}
