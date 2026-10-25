import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  handleRoomRequest,
  type RoomDatabase,
} from '../src/runtime/site-rooms';
import type { SessionStatement } from '../src/runtime/site-sessions';
import { initialSharedPlan } from '../src/domain/shared-plan';
import { roomApi, type Membership } from '../src/room-api';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import { ConvexClient } from 'convex/browser';
vi.mock('convex/browser', () => ({
  ConvexClient: vi.fn(function () {
    return { close: async () => {} };
  }),
}));
import { HttpRoomClient } from '../web/workspace/http-room-client.js';
const view = makeFunctionReference<
  'query',
  { roomId: string; capability: string },
  { revision: number }
>('plans:view');
const history = makeFunctionReference<'query', { floor: string }, unknown[]>(
  'plans:history',
);
const edit = makeFunctionReference<
  'mutation',
  { expectedRevision: number; id: string },
  { revision: number }
>('plans:edit');
let fetcher: ReturnType<typeof vi.fn>;
let events: EventTarget;
let clients: HttpRoomClient[];
beforeEach(() => {
  vi.useFakeTimers();
  clients = [];
  events = new EventTarget();
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        new Response('{}', { headers: { 'content-type': 'application/json' } }),
      ),
    );
  vi.stubGlobal('fetch', fetcher);
});
afterEach(async () => {
  await Promise.all(clients.map((c) => c.close()));
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function client() {
  const c = new HttpRoomClient();
  clients.push(c);
  return c;
}
it('uses exact same-origin JSON POST endpoints and surfaces conflict codes without replay', async () => {
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ revision: 4 }), {
      headers: { 'content-type': 'application/json' },
    }),
  );
  const c = client();
  expect(
    await c.mutation(edit, { expectedRevision: 3, id: 'command' }),
  ).toEqual({ revision: 4 });
  expect(fetcher).toHaveBeenCalledWith(
    '/api/rooms/edit',
    expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      body: JSON.stringify({ expectedRevision: 3, id: 'command' }),
    }),
  );
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: { code: 'revision-conflict' } }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    }),
  );
  await expect(
    c.mutation(edit, { expectedRevision: 3, id: 'other' }),
  ).rejects.toThrow('revision-conflict');
  await vi.advanceTimersByTimeAsync(5000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await expect(
    c.query(makeFunctionReference<'query'>('private:other'), {}),
  ).rejects.toThrow(/operation/);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('polls view and history separately and pauses both while hidden', async () => {
  fetcher.mockImplementation((path: string) =>
    Promise.resolve(
      new Response(
        JSON.stringify(path.endsWith('/history') ? [] : { revision: 1 }),
        { headers: { 'content-type': 'application/json' } },
      ),
    ),
  );
  const c = client();
  const snapshots = vi.fn();
  const histories = vi.fn();
  c.onUpdate(view, { roomId: 'id', capability: 'private' }, snapshots);
  c.onUpdate(history, { floor: 'ore' }, histories);
  await vi.advanceTimersByTimeAsync(0);
  expect(snapshots).toHaveBeenCalledTimes(1);
  expect(histories).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(750);
  expect(snapshots).toHaveBeenCalledTimes(1);
  expect(histories).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, 'visibilityState', {
    value: 'hidden',
    configurable: true,
  });
  events.dispatchEvent(new Event('visibilitychange'));
  const count = fetcher.mock.calls.length;
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetcher).toHaveBeenCalledTimes(count);
  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    configurable: true,
  });
  events.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(count + 2);
});
it('never overlaps a subscription, retries view failures and reconnects honestly', async () => {
  let complete!: (response: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const c = client();
  const statuses = vi.fn();
  const updates = vi.fn();
  const errors = vi.fn();
  c.subscribeToConnectionState(statuses);
  c.onUpdate(view, { roomId: 'id', capability: 'private' }, updates, errors);
  await vi.advanceTimersByTimeAsync(4000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  complete(
    new Response(JSON.stringify({ error: 'temporarily-unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    }),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(errors).toHaveBeenCalledTimes(1);
  expect(statuses.mock.calls.at(-1)![0].isWebSocketConnected).toBe(false);
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ revision: 2 }), {
      headers: { 'content-type': 'application/json' },
    }),
  );
  await vi.advanceTimersByTimeAsync(5000);
  expect(updates).toHaveBeenCalled();
  expect(statuses.mock.calls.at(-1)![0].isWebSocketConnected).toBe(true);
});
it('aborts pending requests and stops timers/callbacks when closed or unsubscribed', async () => {
  fetcher.mockImplementation(
    (_path: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      }),
  );
  const c = client();
  const updates = vi.fn();
  const errors = vi.fn();
  const unsubscribe = c.onUpdate(
    view,
    { roomId: 'id', capability: 'private' },
    updates,
    errors,
  );
  await vi.advanceTimersByTimeAsync(0);
  const signal = fetcher.mock.calls[0]![1].signal as AbortSignal;
  unsubscribe();
  expect(signal.aborted).toBe(true);
  const pending = c.mutation(edit, { expectedRevision: 0, id: 'command' });
  const rejected = expect(pending).rejects.toThrow();
  await c.close();
  await rejected;
  await vi.advanceTimersByTimeAsync(20000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(updates).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
});

it('times out a stalled view, reports disconnection and retries without overlapping it', async () => {
  fetcher.mockImplementationOnce(
    (_path: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () =>
          reject(init.signal!.reason),
        );
      }),
  );
  const c = client();
  const statuses = vi.fn();
  const updates = vi.fn();
  const errors = vi.fn();
  c.subscribeToConnectionState(statuses);
  c.onUpdate(view, { roomId: 'id', capability: 'private' }, updates, errors);
  await vi.advanceTimersByTimeAsync(15000);
  expect(errors).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Room request timed out.' }),
  );
  expect(statuses.mock.calls.at(-1)![0].isWebSocketConnected).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ revision: 5 }), {
      headers: { 'content-type': 'application/json' },
    }),
  );
  await vi.advanceTimersByTimeAsync(1500);
  expect(updates).toHaveBeenCalledWith({ revision: 5 });
  expect(statuses.mock.calls.at(-1)![0].isWebSocketConnected).toBe(true);
});

it.each([
  { status: 503, body: '<html>Gateway unavailable</html>' },
  { status: 408, body: JSON.stringify({ error: 'request-timeout' }) },
  { status: 429, body: JSON.stringify({ error: { code: 'rate-limited' } }) },
])(
  'marks HTTP $status failures as retryable even when the response is HTML',
  async ({ status, body }) => {
    fetcher.mockResolvedValueOnce(new Response(body, { status }));
    await expect(
      client().query(view, { roomId: 'room', capability: 'private' }),
    ).rejects.toMatchObject({ retryable: true });
  },
);

it('marks network and request timeout failures as retryable, while conflict and forbidden responses stay permanent', async () => {
  const c = client();
  fetcher.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(
    c.query(view, { roomId: 'room', capability: 'private' }),
  ).rejects.toMatchObject({ retryable: true });
  for (const [status, code] of [
    [409, 'revision-conflict'],
    [403, 'forbidden'],
    [400, 'invalid-plan'],
  ] as const) {
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code } }), { status }),
    );
    const error = await c
      .mutation(edit, { expectedRevision: 0, id: 'command' })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ data: { code } });
    expect(error).not.toHaveProperty('retryable', true);
  }
  fetcher.mockImplementationOnce(
    (_input, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () =>
          reject(init.signal!.reason),
        );
      }),
  );
  const pending = c.query(view, { roomId: 'room', capability: 'private' });
  const rejected = expect(pending).rejects.toMatchObject({ retryable: true });
  await vi.advanceTimersByTimeAsync(15000);
  await rejected;
});

it('reports direct reads and mutations through connectionState', async () => {
  const c = client();
  expect(c.connectionState().isWebSocketConnected).toBe(false);
  await c.query(view, { roomId: 'room', capability: 'private' });
  expect(c.connectionState().isWebSocketConnected).toBe(true);
  fetcher.mockRejectedValueOnce(new TypeError('Offline'));
  const command = { expectedRevision: 1, id: 'same-command' };
  await expect(
    c.query(view, { roomId: 'room', capability: 'private' }),
  ).rejects.toMatchObject({
    retryable: true,
  });
  expect(c.connectionState().isWebSocketConnected).toBe(false);
  await c.mutation(edit, command);
  expect(c.connectionState().isWebSocketConnected).toBe(true);
});

it.each([
  'revision-conflict',
  'undo-conflict',
  'forbidden',
  'invalid-plan',
  'plan-too-large',
])(
  'exposes structured %s errors to the existing room error handler',
  async (code) => {
    const { roomErrorCode } = await import('../web/workspace/room-client');
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code } }), { status: 409 }),
    );
    const error = await client()
      .mutation(edit, { expectedRevision: 0, id: 'command' })
      .catch((e: unknown) => e);
    expect(roomErrorCode(error)).toBe(code);
    expect(error).not.toHaveProperty('retryable', true);
  },
);

it('discovers HTTP rooms without requiring Convex configuration', async () => {
  vi.resetModules();
  vi.stubEnv('VITE_CONVEX_URL', '');
  fetcher.mockImplementation((path: string) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          path === '/api/room-config' ? { transport: 'http' } : {},
        ),
      ),
    ),
  );
  const { getRoomClient } = await import('../web/workspace/room-client');
  const c = await getRoomClient();
  clients.push(c as HttpRoomClient);
  await c.query(view, { roomId: 'room', capability: 'private' });
  expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
    '/config.json',
    '/api/room-config',
    '/api/rooms/view',
  ]);
  fetcher.mockRejectedValueOnce(new TypeError('Offline'));
  await expect(
    c.query(view, { roomId: 'room', capability: 'private' }),
  ).rejects.toMatchObject({ retryable: true });
  expect(await getRoomClient()).toBe(c);
  vi.unstubAllEnvs();
});

it.each(['create', 'join', 'view', 'edit', 'undo', 'history'])(
  'keeps %s credentials in the POST body',
  async (operation) => {
    const c = client();
    const args = {
      roomId: 'room',
      capability: 'private',
      shareSecret: 'invite',
    };
    await c.action(makeFunctionReference<'action'>(`plans:${operation}`), args);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/rooms/${operation}`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      }),
    );
  },
);

it.each(['environment', 'config'])(
  'preserves explicit Convex configuration from %s',
  async (source) => {
    vi.resetModules();
    vi.stubEnv(
      'VITE_CONVEX_URL',
      source === 'environment' ? 'https://explicit.convex.cloud' : '',
    );
    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ convexUrl: 'https://configured.convex.cloud' }),
      ),
    );
    const { getRoomClient } = await import('../web/workspace/room-client');
    const c = await getRoomClient();
    await c.close();
    expect(ConvexClient).toHaveBeenCalledWith(
      source === 'environment'
        ? 'https://explicit.convex.cloud'
        : 'https://configured.convex.cloud',
      { logger: false },
    );
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(
      source === 'environment' ? [] : ['/config.json'],
    );
  },
);

it('cleans up visibility listeners on close and leaves no polling timers', async () => {
  const remove = vi.spyOn(document, 'removeEventListener');
  const c = client();
  c.onUpdate(view, { roomId: 'room', capability: 'private' }, vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  await c.close();
  expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
  expect(c.connectionState().isWebSocketConnected).toBe(false);
});

// Exercise lost acknowledgements against the same transactional SQLite adapter as the D1 tests.
function roomDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('deploy/room-migration.sql', 'utf8'));
  const executions = new WeakMap<
    SessionStatement,
    () => { meta: { changes: number } }
  >();
  const db: RoomDatabase = {
    prepare(sql) {
      let args: SQLInputValue[] = [];
      const execute = () => ({
        meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) },
      });
      const statement: SessionStatement = {
        bind(...values) {
          args = values;
          return statement;
        },
        async first<T>() {
          return (sqlite.prepare(sql).get(...args) ?? null) as T | null;
        },
        async all<T>() {
          return { results: sqlite.prepare(sql).all(...args) as T[] };
        },
        async run() {
          return execute();
        },
      };
      executions.set(statement, execute);
      return statement;
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((statement) =>
          executions.get(statement)!(),
        );
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db, sqlite };
}

it.each(['edit', 'undo'] as const)(
  'recovers a lost %s acknowledgement using the original command and committed receipt',
  async (operation) => {
    vi.useRealTimers();
    const { db, sqlite } = roomDatabase();
    const server = (path: string, init: RequestInit) =>
      handleRoomRequest(
        new Request('https://site.test' + path, init),
        db,
        'test-browser',
      );
    fetcher.mockImplementation(server);
    const c = client();
    try {
      const member: Membership = await c.action(roomApi.create, {
        name: 'Alice',
        plan: initialSharedPlan(),
      });
      const auth = { roomId: member.roomId, capability: member.capability };
      const plan = initialSharedPlan();
      plan.layout.rows = 4;
      let command: Promise<unknown>;
      let lost = false;
      let retries = 0;
      const bodies: string[] = [];
      if (operation === 'undo')
        await c.mutation(roomApi.edit, {
          ...auth,
          id: 'setup',
          expectedRevision: 0,
          plan,
        });
      const history = await c.query(roomApi.history, {
        ...auth,
        paginationOpts: { numItems: 20, cursor: null },
      });
      fetcher.mockImplementation(async (path: string, init: RequestInit) => {
        const response = await server(path, init);
        if (path === '/api/rooms/' + operation) {
          bodies.push(init.body as string);
          expect(response.status).toBe(200);
          if (!lost) {
            lost = true;
            throw new TypeError('Connection lost after server commit');
          }
          retries++;
          expect(await response.clone().json()).toMatchObject({
            duplicate: true,
          });
        }
        return response;
      });
      if (operation === 'edit')
        command = c.mutation(roomApi.edit, {
          ...auth,
          id: 'lost-edit',
          expectedRevision: 0,
          plan,
        });
      else
        command = c.mutation(roomApi.undo, {
          ...auth,
          id: 'lost-undo',
          expectedRevision: 1,
          entryId: history.page[0]!.id,
        });
      await expect(command).resolves.toEqual({
        revision: operation === 'edit' ? 1 : 2,
        duplicate: true,
      });
      expect(retries).toBe(1);
      expect(bodies).toHaveLength(2);
      expect(bodies[1]).toBe(bodies[0]);
      const result = await c.query(roomApi.view, auth);
      expect(result.revision).toBe(operation === 'edit' ? 1 : 2);
      expect(result.plan.layout.rows).toBe(
        operation === 'edit' ? 4 : initialSharedPlan().layout.rows,
      );
      expect(c.connectionState().isWebSocketConnected).toBe(true);
    } finally {
      await c.close();
      sqlite.close();
    }
  },
);

it('bounds transient mutation retries to two additional attempts and stops on close during backoff', async () => {
  fetcher.mockRejectedValue(new TypeError('Offline'));
  const c = client();
  const pending = c.mutation(edit, { id: 'command', expectedRevision: 0 });
  const rejected = expect(pending).rejects.toMatchObject({ retryable: true });
  await vi.advanceTimersByTimeAsync(1000);
  await rejected;
  expect(fetcher).toHaveBeenCalledTimes(3);
  const next = c.mutation(edit, { id: 'other', expectedRevision: 0 });
  const closed = expect(next).rejects.toThrow(/closed/);
  await vi.advanceTimersByTimeAsync(0);
  await c.close();
  await closed;
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['create', 'join'])(
  'does not automatically replay a failed %s action',
  async (operation) => {
    fetcher.mockRejectedValue(new TypeError('Offline'));
    await expect(
      client().action(
        makeFunctionReference<'action'>(`plans:${operation}`),
        {},
      ),
    ).rejects.toMatchObject({ retryable: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it('emits one initial snapshot and only changed revisions across unchanged polls', async () => {
  fetcher.mockImplementation(() =>
    Promise.resolve(Response.json({ revision: 1, plan: {} })),
  );
  const c = client();
  const updates = vi.fn();
  c.onUpdate(view, { roomId: 'room', capability: 'private' }, updates);
  await vi.advanceTimersByTimeAsync(2250);
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(updates).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValueOnce(Response.json({ revision: 2, plan: {} }));
  await vi.advanceTimersByTimeAsync(750);
  expect(updates).toHaveBeenCalledTimes(2);
  expect(updates).toHaveBeenLastCalledWith({ revision: 2, plan: {} });
});

it.each([408, 429, 503])(
  'retries transient HTTP %s mutation responses with the original body',
  async (status) => {
    fetcher.mockImplementationOnce(() =>
      Promise.resolve(Response.json({ error: 'unavailable' }, { status })),
    );
    const pending = client().mutation(edit, {
      id: 'command',
      expectedRevision: 0,
    });
    await vi.advanceTimersByTimeAsync(250);
    await expect(pending).resolves.toEqual({});
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]![1].body).toBe(fetcher.mock.calls[0]![1].body);
  },
);

it('retries a timed out mutation once with the original command and never overlaps attempts', async () => {
  fetcher.mockImplementationOnce(
    (_path: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () =>
          reject(init.signal!.reason),
        );
      }),
  );
  const pending = client().mutation(edit, {
    id: 'timeout-command',
    expectedRevision: 0,
  });
  await vi.advanceTimersByTimeAsync(15000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(250);
  await expect(pending).resolves.toEqual({});
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]![1].body).toBe(fetcher.mock.calls[0]![1].body);
});

it('does not retry a permanent structured conflict even if the gateway uses status 503', async () => {
  fetcher.mockResolvedValueOnce(
    Response.json({ error: { code: 'revision-conflict' } }, { status: 503 }),
  );
  await expect(
    client().mutation(edit, { id: 'conflict', expectedRevision: 0 }),
  ).rejects.toMatchObject({ data: { code: 'revision-conflict' } });
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('emits one unchanged snapshot after an error to clear stale consumer errors, then resumes deduplication', async () => {
  fetcher.mockImplementation(() =>
    Promise.resolve(Response.json({ revision: 1 })),
  );
  const c = client();
  const updates = vi.fn();
  const errors = vi.fn();
  c.onUpdate(view, { roomId: 'room', capability: 'private' }, updates, errors);
  await vi.advanceTimersByTimeAsync(0);
  fetcher.mockRejectedValueOnce(new TypeError('Offline'));
  await vi.advanceTimersByTimeAsync(750);
  expect(errors).toHaveBeenCalledTimes(1);
  expect(updates).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1500);
  expect(updates).toHaveBeenCalledTimes(2);
  expect(updates).toHaveBeenLastCalledWith({ revision: 1 });
  await vi.advanceTimersByTimeAsync(1500);
  expect(updates).toHaveBeenCalledTimes(2);
});
