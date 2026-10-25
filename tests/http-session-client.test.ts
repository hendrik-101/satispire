import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import { HttpSessionClient } from '../web/workspace/http-session-client.js';
const read = makeFunctionReference<
  'query',
  { sessionId: string; capability: string },
  { revision: number }
>('sessions:read');
const peers = makeFunctionReference<'query', { floor: string }, unknown[]>(
  'sessions:peers',
);
const commit = makeFunctionReference<
  'mutation',
  { expectedRevision: number; id: string },
  { revision: number }
>('sessions:commit');
let fetcher: ReturnType<typeof vi.fn>;
let events: EventTarget;
let clients: HttpSessionClient[];
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function client() {
  const c = new HttpSessionClient();
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
    await c.mutation(commit, { expectedRevision: 3, id: 'command' }),
  ).toEqual({ revision: 4 });
  expect(fetcher).toHaveBeenCalledWith(
    '/api/sessions/commit',
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
    c.mutation(commit, { expectedRevision: 3, id: 'other' }),
  ).rejects.toThrow('revision-conflict');
  await vi.advanceTimersByTimeAsync(5000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await expect(
    c.query(makeFunctionReference<'query'>('private:other'), {}),
  ).rejects.toThrow(/operation/);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('polls read and peers separately and pauses both while hidden', async () => {
  fetcher.mockImplementation((path: string) =>
    Promise.resolve(
      new Response(
        JSON.stringify(path.endsWith('/peers') ? [] : { revision: 1 }),
        { headers: { 'content-type': 'application/json' } },
      ),
    ),
  );
  const c = client();
  const snapshots = vi.fn();
  const presences = vi.fn();
  c.onUpdate(read, { sessionId: 'id', capability: 'private' }, snapshots);
  c.onUpdate(peers, { floor: 'ore' }, presences);
  await vi.advanceTimersByTimeAsync(0);
  expect(snapshots).toHaveBeenCalledTimes(1);
  expect(presences).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(750);
  expect(snapshots).toHaveBeenCalledTimes(2);
  expect(presences).toHaveBeenCalledTimes(6);
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
it('never overlaps a subscription, retries read failures and reconnects honestly', async () => {
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
  c.onUpdate(read, { sessionId: 'id', capability: 'private' }, updates, errors);
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
    read,
    { sessionId: 'id', capability: 'private' },
    updates,
    errors,
  );
  await vi.advanceTimersByTimeAsync(0);
  const signal = fetcher.mock.calls[0]![1].signal as AbortSignal;
  unsubscribe();
  expect(signal.aborted).toBe(true);
  const pending = c.mutation(commit, { expectedRevision: 0, id: 'command' });
  const rejected = expect(pending).rejects.toThrow();
  await c.close();
  await rejected;
  await vi.advanceTimersByTimeAsync(20000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(updates).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
});

it('times out a stalled read, reports disconnection and retries without overlapping it', async () => {
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
  c.onUpdate(read, { sessionId: 'id', capability: 'private' }, updates, errors);
  await vi.advanceTimersByTimeAsync(15000);
  expect(errors).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Session request timed out.' }),
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
      client().mutation(commit, { expectedRevision: 0, id: 'command' }),
    ).rejects.toMatchObject({ retryable: true });
  },
);

it('marks network and request timeout failures as retryable, while conflict and forbidden responses stay permanent', async () => {
  const c = client();
  fetcher.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(
    c.mutation(commit, { expectedRevision: 0, id: 'command' }),
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
      .mutation(commit, { expectedRevision: 0, id: 'command' })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ message: code });
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
  const pending = c.mutation(commit, { expectedRevision: 0, id: 'command' });
  const rejected = expect(pending).rejects.toMatchObject({ retryable: true });
  await vi.advanceTimersByTimeAsync(15000);
  await rejected;
});
