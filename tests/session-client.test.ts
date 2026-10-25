import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planFileSchema } from '../src/plan-file.js';
import type { SessionSnapshot } from '../src/session-plan.js';
import {
  createSessionController,
  type SessionStatus,
} from '../web/workspace/session.js';

const remote = vi.hoisted(() => ({
  action: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
  onUpdate: vi.fn(),
  close: vi.fn(),
  subscribeToConnectionState: vi.fn(),
}));
vi.mock('convex/browser', () => ({
  ConvexClient: class {
    action = remote.action;
    query = remote.query;
    mutation = remote.mutation;
    onUpdate = remote.onUpdate;
    close = remote.close;
    subscribeToConnectionState = remote.subscribeToConnectionState;
  },
}));
const initialPlan = planFileSchema.parse({
  schemaVersion: 1,
  catalogVersion: 'test',
  production: {
    targets: [{ itemId: 'example:plate', rate: '20' }],
    recipes: { 'example:plate': 'example:press' },
    imports: ['example:ore'],
  },
  layout: { rows: 3 },
});
const editedPlan = {
  ...initialPlan,
  layout: { ...initialPlan.layout, rows: 5 },
};
const id = 'a'.repeat(64);
const membership = {
  sessionId: id,
  participantId: 'participant',
  capability: 'b'.repeat(64),
};
let location: URL;
let storage: Storage;
let events: EventTarget;
let controllers: ReturnType<typeof createSessionController>[];
function controller(convexUrl?: string) {
  const snapshots: SessionSnapshot[] = [];
  const statuses: SessionStatus[] = [];
  const onPresence = vi.fn();
  const c = createSessionController({
    initialPlan,
    onSnapshot: (s) => snapshots.push(s),
    onStatus: (s) => statuses.push(s),
    onPresence,
    ...(convexUrl ? { convexUrl } : {}),
  });
  controllers.push(c);
  return { c, snapshots, statuses, onPresence };
}
beforeEach(() => {
  vi.useFakeTimers();
  controllers = [];
  location = new URL('http://localhost/');
  const values = new Map<string, string>();
  storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => {
      values.set(k, v);
    },
    removeItem: (k) => {
      values.delete(k);
    },
    clear: () => values.clear(),
    key: (n) => [...values.keys()][n] ?? null,
    get length() {
      return values.size;
    },
  };
  events = new EventTarget();
  vi.stubGlobal('window', {
    get location() {
      return location;
    },
    localStorage: storage,
    history: {
      replaceState: (_s: unknown, _t: string, url: string) => {
        location = new URL(url);
      },
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  vi.resetAllMocks();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response('', { status: 404 })),
      ),
  );
  remote.onUpdate.mockReturnValue(vi.fn());
  remote.subscribeToConnectionState.mockReturnValue(vi.fn());
  remote.action.mockResolvedValue(membership);
  remote.query.mockResolvedValue({ revision: 0, plan: initialPlan });
  remote.mutation.mockResolvedValue({ revision: 1, duplicate: false });
});
afterEach(() => {
  controllers.forEach((c) => c.close());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('local browser sessions', () => {
  it('creates a random URL and restores the complete saved plan after reload', async () => {
    const { c } = controller();
    expect((await c.start()).plan).toEqual(initialPlan);
    expect(c.mode).toBe('local');
    expect(location.searchParams.get('session')).toMatch(/^[a-f0-9]{64}$/);
    await c.commit(editedPlan);
    c.close();
    const restored = controller();
    expect(await restored.c.start()).toEqual({ revision: 1, plan: editedPlan });
    expect(restored.statuses.at(-1)?.message).toContain('Browser');
    expect(restored.snapshots).toHaveLength(1);
  });
  it('reuses the last local session from the root URL without replacing it with defaults', async () => {
    const first = controller();
    await first.c.start();
    await first.c.commit(editedPlan);
    const link = first.c.link;
    first.c.close();
    location = new URL('http://localhost/');
    const next = controller();
    expect((await next.c.start()).plan).toEqual(editedPlan);
    expect(next.c.link).toBe(link);
  });
  it('rejects unknown or malformed local invitations without creating unrelated plans', async () => {
    location.searchParams.set('session', id);
    const unknown = controller();
    await expect(unknown.c.start()).rejects.toThrow(/lokal|Browser/);
    expect(unknown.snapshots).toHaveLength(0);
    location.searchParams.set('session', '../bad');
    await expect(controller().c.start()).rejects.toThrow();
    expect(storage.length).toBe(0);
  });
  it('keeps editing usable while reporting blocked storage honestly', async () => {
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const { c, statuses } = controller();
    await c.start();
    await c.commit(editedPlan);
    expect(statuses.at(-1)?.state).toBe('storage-error');
    expect(statuses.at(-1)?.message).toMatch(/gespeichert/);
  });
  it('rejects stale local edits from another tab rather than overwriting the newer plan', async () => {
    const one = controller();
    await one.c.start();
    const two = controller();
    await two.c.start();
    await one.c.commit(editedPlan);
    await expect(two.c.commit(initialPlan)).rejects.toThrow(/conflict/);
    expect(two.statuses.at(-1)?.state).toBe('conflict');
  });
});

describe('online browser sessions', () => {
  it('stores private membership outside the invitation and restores it without joining again', async () => {
    const one = controller('https://example.convex.cloud');
    await one.c.start();
    one.c.close();
    expect(one.c.link).not.toContain(membership.capability);
    const restored = controller('https://example.convex.cloud');
    await restored.c.start();
    expect(remote.action).toHaveBeenCalledTimes(1);
    expect(remote.query).toHaveBeenLastCalledWith(expect.anything(), {
      sessionId: id,
      capability: membership.capability,
    });
  });
  it('subscribes independently to snapshots and scoped peers, suppressing duplicate revisions', async () => {
    const { c, snapshots, onPresence } = controller(
      'https://example.convex.cloud',
    );
    await c.start();
    const read = remote.onUpdate.mock.calls[0]![2];
    read({ revision: 0, plan: editedPlan });
    expect(snapshots).toHaveLength(1);
    c.setPresence({ view: 'layout', floor: 'plate', cursor: { x: 4, y: 8 } });
    const peerCall = remote.onUpdate.mock.calls.at(-1)!;
    expect(peerCall[1]).toMatchObject({ view: 'layout', floor: 'plate' });
    peerCall[2]([
      {
        participantId: 'peer',
        clientId: 'peer-tab',
        name: 'Peer',
        color: '#f39a45',
        view: 'layout',
        floor: 'plate',
        cursor: { x: 4, y: 8 },
        updatedAt: Date.now(),
      },
    ]);
    expect(onPresence.mock.calls.at(-1)?.[0]).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(15001);
    expect(onPresence.mock.calls.at(-1)?.[0]).toEqual([]);
    expect(snapshots).toHaveLength(1);
  });
  it('queues saves against acknowledged revisions and preserves visible conflicts', async () => {
    let finish!: (value: { revision: number; duplicate: boolean }) => void;
    remote.mutation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { c, statuses } = controller('https://example.convex.cloud');
    await c.start();
    const first = c.commit(editedPlan);
    const second = c.commit(initialPlan);
    await Promise.resolve();
    finish({ revision: 1, duplicate: false });
    await first;
    await second;
    expect(
      remote.mutation.mock.calls.map((call) => call[1].expectedRevision),
    ).toEqual([0, 1]);
    remote.mutation.mockRejectedValueOnce(new Error('revision-conflict'));
    await expect(c.commit(editedPlan)).rejects.toThrow('revision-conflict');
    const count = remote.mutation.mock.calls.length;
    await expect(c.commit(initialPlan)).rejects.toThrow(/conflict/);
    expect(remote.mutation).toHaveBeenCalledTimes(count);
    expect(statuses.at(-1)?.state).toBe('conflict');
  });
  it('rejects insecure non-loopback Convex URLs', async () => {
    await expect(controller('http://example.com').c.start()).rejects.toThrow(
      /HTTPS/,
    );
    expect(remote.action).not.toHaveBeenCalled();
  });
});

it('defers subscription snapshots during a pending save, rejects older acknowledgments and retains the draft on conflict', async () => {
  let rejectSave!: (error: Error) => void;
  remote.mutation.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      }),
  );
  const { c, snapshots, statuses } = controller('https://example.convex.cloud');
  await c.start();
  const read = remote.onUpdate.mock.calls[0]![2];
  const saving = c.commit(editedPlan);
  const rejected = expect(saving).rejects.toThrow('revision-conflict');
  await Promise.resolve();
  read({ revision: 1, plan: initialPlan });
  expect(snapshots).toEqual([{ revision: 0, plan: initialPlan }]);
  rejectSave(new Error('revision-conflict'));
  await rejected;
  read({ revision: 2, plan: initialPlan });
  expect(snapshots).toHaveLength(1);
  expect(statuses.at(-1)?.state).toBe('conflict');
});

it('does not regress when the initial subscription already has a newer revision than the query', async () => {
  remote.onUpdate.mockImplementationOnce((_ref, _args, callback) => {
    callback({ revision: 3, plan: editedPlan });
    return vi.fn();
  });
  remote.mutation.mockResolvedValueOnce({ revision: 4, duplicate: false });
  const { c, snapshots } = controller('https://example.convex.cloud');
  expect(await c.start()).toEqual({ revision: 3, plan: editedPlan });
  await c.commit(initialPlan);
  expect(remote.mutation.mock.calls[0]![1].expectedRevision).toBe(3);
  expect(snapshots[0]).toEqual({ revision: 3, plan: editedPlan });
  const read = remote.onUpdate.mock.calls[0]![2];
  read({ revision: 2, plan: editedPlan });
  expect(snapshots).toEqual([
    { revision: 3, plan: editedPlan },
    { revision: 4, plan: initialPlan },
  ]);
});

it('warns before reload during an unacknowledged save and keeps disconnected status honest', async () => {
  let finish!: (value: { revision: number; duplicate: boolean }) => void;
  remote.mutation.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { c, statuses } = controller('https://example.convex.cloud');
  await c.start();
  remote.subscribeToConnectionState.mock.calls[0]![0]({
    isWebSocketConnected: false,
  });
  const saving = c.commit(editedPlan);
  await Promise.resolve();
  const reload = new Event('beforeunload', { cancelable: true });
  events.dispatchEvent(reload);
  expect(reload.defaultPrevented).toBe(true);
  finish({ revision: 1, duplicate: false });
  await saving;
  expect(statuses.at(-1)?.state).toBe('connecting');
  const safeReload = new Event('beforeunload', { cancelable: true });
  events.dispatchEvent(safeReload);
  expect(safeReload.defaultPrevented).toBe(false);
  remote.subscribeToConnectionState.mock.calls[0]![0]({
    isWebSocketConnected: true,
  });
  expect(statuses.at(-1)?.state).toBe('saved');
});

it('throttles cursor sends, heartbeats, changes peer scope and clears on hidden/leave', async () => {
  remote.mutation.mockResolvedValue(null);
  const { c, onPresence } = controller('https://example.convex.cloud');
  await c.start();
  c.setPresence({ view: 'layout', floor: 'ore', cursor: { x: 1, y: 2 } });
  const oldPeers = remote.onUpdate.mock.calls.at(-1)![2];
  c.setPresence({ view: 'layout', floor: 'ore', cursor: { x: 3, y: 4 } });
  c.setPresence({ view: 'layout', floor: 'ore', cursor: { x: 5, y: 6 } });
  expect(remote.mutation).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(80);
  expect(remote.mutation).toHaveBeenCalledTimes(2);
  expect(remote.mutation.mock.calls.at(-1)![1]).toMatchObject({
    cursor: { x: 5, y: 6 },
  });
  await vi.advanceTimersByTimeAsync(5000);
  expect(remote.mutation).toHaveBeenCalledTimes(3);
  c.setPresence({ view: 'production', floor: 'plate', cursor: null });
  expect(remote.onUpdate.mock.calls.at(-1)![1]).toMatchObject({
    view: 'production',
    floor: 'plate',
  });
  oldPeers([
    {
      participantId: 'peer',
      clientId: 'peer-tab',
      name: 'Peer',
      color: '#f39a45',
      view: 'layout',
      floor: 'ore',
      cursor: { x: 1, y: 2 },
      updatedAt: Date.now(),
    },
  ]);
  expect(onPresence.mock.calls.at(-1)![0]).toEqual([]);
  c.setPresence({
    view: 'production',
    floor: 'plate',
    cursor: { x: 0.4, y: 0.7 },
  });
  Object.defineProperty(document, 'visibilityState', {
    value: 'hidden',
    configurable: true,
  });
  events.dispatchEvent(new Event('visibilitychange'));
  expect(remote.mutation.mock.calls.at(-1)![1]).toMatchObject({ cursor: null });
  const before = remote.mutation.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10000);
  expect(remote.mutation.mock.calls.length).toBe(before);
  c.close();
  expect(remote.mutation.mock.calls.at(-1)![1]).toMatchObject({ cursor: null });
});

it('expires a received stale overlay precisely after its TTL even between heartbeat ticks', async () => {
  const { c, onPresence } = controller('https://example.convex.cloud');
  await c.start();
  c.setPresence({ view: 'layout', floor: 'plate', cursor: null });
  const peers = remote.onUpdate.mock.calls.at(-1)![2];
  peers([
    {
      participantId: 'peer',
      clientId: 'peer-tab',
      name: 'Peer',
      color: '#f39a45',
      view: 'layout',
      floor: 'plate',
      cursor: { x: 1, y: 2 },
      updatedAt: Date.now() - 14900,
    },
  ]);
  expect(onPresence.mock.calls.at(-1)![0]).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(100);
  expect(onPresence.mock.calls.at(-1)![0]).toEqual([]);
});

it('discovers the real same-origin HTTP transport, persists membership and saves through its exact protocol', async () => {
  const fetcher = vi.mocked(fetch);
  fetcher.mockImplementation(async (input) => {
    const path = String(input);
    const value =
      path === '/api/session-config'
        ? { transport: 'http' }
        : path === '/api/sessions/create'
          ? membership
          : path === '/api/sessions/read'
            ? { revision: 0, plan: initialPlan }
            : { revision: 1, duplicate: false };
    return new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json' },
    });
  });
  const first = controller();
  await first.c.start();
  expect(first.c.mode).toBe('online');
  expect(first.statuses.at(-1)?.state).toBe('saved');
  expect(first.statuses.at(-1)?.mode).toBe('online');
  await first.c.commit(editedPlan);
  const call = fetcher.mock.calls.find(
    (call) => call[0] === '/api/sessions/commit',
  )!;
  expect(JSON.parse(String(call[1]!.body))).toMatchObject({
    sessionId: id,
    capability: membership.capability,
    expectedRevision: 0,
    plan: editedPlan,
  });
  expect(first.snapshots.at(-1)).toEqual({ revision: 1, plan: editedPlan });
  expect(first.c.link).not.toContain(membership.capability);
  first.c.close();
  location = new URL('http://localhost/');
  const restored = controller();
  await restored.c.start();
  expect(
    fetcher.mock.calls.filter((call) => call[0] === '/api/sessions/create'),
  ).toHaveLength(1);
  expect(restored.c.sessionId).toBe(id);
  expect(remote.action).not.toHaveBeenCalled();
});

it('keeps an advertised HTTP backend failure visible without replacing it with a local session', async () => {
  vi.mocked(fetch).mockImplementation(async (input) =>
    String(input) === '/api/session-config'
      ? new Response(JSON.stringify({ transport: 'http' }), {
          headers: { 'content-type': 'application/json' },
        })
      : new Response(
          JSON.stringify({ error: { code: 'storage-unavailable' } }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        ),
  );
  const { c, statuses, snapshots } = controller();
  await expect(c.start()).rejects.toThrow('storage-unavailable');
  expect(c.mode).toBe('online');
  expect(statuses.at(-1)?.state).toBe('error');
  expect(snapshots).toHaveLength(0);
  expect(storage.length).toBe(0);
  expect(location.search).toBe('');
});

it('uses explicit local fallback when static hosting answers config discovery with HTML', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response('<html>Static app</html>', {
      headers: { 'content-type': 'text/html' },
    }),
  );
  const { c, statuses } = controller();
  await c.start();
  expect(c.mode).toBe('local');
  expect(statuses.at(-1)?.message).toContain('Browser');
  expect(remote.action).not.toHaveBeenCalled();
});

it('bounds config discovery and aborts it on close without creating local defaults', async () => {
  vi.mocked(fetch).mockImplementation(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      }),
  );
  const { c, snapshots } = controller();
  const started = c.start();
  const rejected = expect(started).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(2000);
  await rejected;
  expect(snapshots).toHaveLength(0);
  const next = controller();
  const opening = next.c.start();
  const closed = expect(opening).rejects.toThrow();
  next.c.close();
  await closed;
  expect(vi.mocked(fetch).mock.calls.at(-1)![1]!.signal!.aborted).toBe(true);
});

it('accepts the static app response during config discovery instead of requiring a JSON route', async () => {
  vi.mocked(fetch).mockImplementation(async (_input, init) => {
    const accept = new Headers(init?.headers).get('accept') ?? '*/*';
    return accept === 'application/json'
      ? new Response('Not Acceptable', { status: 406 })
      : new Response('<html>Static app route</html>', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        });
  });
  const { c, statuses } = controller();
  await c.start();
  expect(c.mode).toBe('local');
  expect(c.sessionId).toMatch(/^[a-f0-9]{64}$/);
  expect(statuses.at(-1)?.state).toBe('saved');
});

it('keeps genuine config service failures visible instead of claiming a saved local session', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response('Service unavailable', { status: 500 }),
  );
  const { c, statuses, snapshots } = controller();
  await expect(c.start()).rejects.toThrow('(500)');
  expect(statuses.at(-1)?.state).toBe('error');
  expect(snapshots).toHaveLength(0);
  expect(c.sessionId).toBeNull();
});

function installHttpBackend(
  commit: (body: Record<string, unknown>) => Response | Promise<Response>,
) {
  let revision = 0;
  const fetcher = vi.mocked(fetch);
  fetcher.mockImplementation(async (input, init) => {
    const path = String(input);
    if (path === '/api/sessions/commit')
      return commit(JSON.parse(String(init!.body)) as Record<string, unknown>);
    const value =
      path === '/api/session-config'
        ? { transport: 'http' }
        : path === '/api/sessions/create'
          ? membership
          : path === '/api/sessions/read'
            ? { revision, plan: initialPlan }
            : [];
    return new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json' },
    });
  });
  return {
    fetcher,
    setRevision: (next: number) => {
      revision = next;
    },
  };
}

it('retries an HTTP save whose acknowledgement was lost with the same command and defers its polled snapshot', async () => {
  const commands: Record<string, unknown>[] = [];
  const backend = installHttpBackend(async (body) => {
    commands.push(body);
    backend.setRevision(1);
    if (commands.length === 1)
      throw new TypeError('Failed to fetch after applying command');
    return new Response(JSON.stringify({ revision: 1, duplicate: true }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  const { c, snapshots, statuses } = controller();
  await c.start();
  const saving = c.commit(editedPlan);
  void saving.catch(() => {});
  await vi.advanceTimersByTimeAsync(0);
  expect(commands).toHaveLength(1);
  expect(snapshots).toHaveLength(1);
  expect(statuses.at(-1)?.state).toBe('connecting');
  const reload = new Event('beforeunload', { cancelable: true });
  events.dispatchEvent(reload);
  expect(reload.defaultPrevented).toBe(true);
  await vi.advanceTimersByTimeAsync(250);
  await saving;
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  expect(snapshots).toEqual([
    { revision: 0, plan: initialPlan },
    { revision: 1, plan: editedPlan },
  ]);
  expect(statuses.at(-1)?.state).toBe('saved');
});

it('recovers from a brief HTTP outage and then sends the next queued plan against the acknowledged revision', async () => {
  const commands: Record<string, unknown>[] = [];
  installHttpBackend(async (body) => {
    commands.push(body);
    if (commands.length <= 2)
      return new Response('<html>Unavailable</html>', { status: 503 });
    return new Response(
      JSON.stringify({
        revision: Number(body.expectedRevision) + 1,
        duplicate: false,
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  });
  const { c, snapshots } = controller();
  await c.start();
  const first = c.commit(editedPlan);
  const second = c.commit(initialPlan);
  void first.catch(() => {});
  void second.catch(() => {});
  await vi.advanceTimersByTimeAsync(0);
  expect(commands).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(250);
  expect(commands).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(500);
  await first;
  await second;
  expect(commands).toHaveLength(4);
  expect(commands[0]).toEqual(commands[1]);
  expect(commands[1]).toEqual(commands[2]);
  expect(commands[3]!.expectedRevision).toBe(1);
  expect(commands[3]!.id).not.toBe(commands[0]!.id);
  expect(snapshots.at(-1)).toEqual({ revision: 2, plan: initialPlan });
});

it('keeps actual HTTP conflicts latched without retrying or publishing newer snapshots over local intent', async () => {
  const commands: Record<string, unknown>[] = [];
  const backend = installHttpBackend((body) => {
    commands.push(body);
    return new Response(
      JSON.stringify({ error: { code: 'revision-conflict' } }),
      { status: 409 },
    );
  });
  const { c, snapshots, statuses } = controller();
  await c.start();
  await expect(c.commit(editedPlan)).rejects.toThrow('revision-conflict');
  backend.setRevision(2);
  await vi.advanceTimersByTimeAsync(5000);
  await expect(c.commit(initialPlan)).rejects.toThrow('revision-conflict');
  expect(commands).toHaveLength(1);
  expect(snapshots).toHaveLength(1);
  expect(statuses.at(-1)?.state).toBe('conflict');
});

it('cancels a pending HTTP save retry and its serialized queue when closed', async () => {
  const commands: Record<string, unknown>[] = [];
  installHttpBackend((body) => {
    commands.push(body);
    throw new TypeError('offline');
  });
  const { c, statuses } = controller();
  await c.start();
  const first = c.commit(editedPlan);
  const second = c.commit(initialPlan);
  void first.catch(() => {});
  void second.catch(() => {});
  await vi.advanceTimersByTimeAsync(0);
  expect(statuses.at(-1)?.state).toBe('connecting');
  c.close();
  await expect(first).rejects.toThrow();
  await expect(second).rejects.toThrow();
  const count = statuses.length;
  await vi.advanceTimersByTimeAsync(30000);
  expect(commands).toHaveLength(1);
  expect(statuses).toHaveLength(count);
  expect(vi.getTimerCount()).toBe(0);
});

it('does not register a retry after a status callback synchronously closes the controller', async () => {
  installHttpBackend(() => {
    throw new TypeError('offline');
  });
  const c = createSessionController({
    initialPlan,
    onSnapshot: () => {},
    onPresence: () => {},
    onStatus: (status) => {
      if (status.message.includes('Änderungen noch nicht gespeichert'))
        c.close();
    },
  });
  controllers.push(c);
  await c.start();
  const saving = c.commit(editedPlan);
  void saving.catch(() => {});
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(0);
  await expect(saving).rejects.toThrow();
});

it.each([undefined, 'https://configured.convex.cloud'])(
  'keeps explicit offline planning isolated from discovery and configured Convex (%s)',
  async (convexUrl) => {
    const c = createSessionController({
      initialPlan,
      localOnly: true,
      ...(convexUrl ? { convexUrl } : {}),
      onSnapshot: () => {},
      onStatus: () => {},
      onPresence: () => {},
    });
    controllers.push(c);
    await c.start();
    expect(c.mode).toBe('local');
    await c.commit(editedPlan);
    expect(storage.getItem('satispire.session.local.' + c.sessionId)).toContain(
      '"rows":5',
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(remote.action).not.toHaveBeenCalled();
  },
);
