import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from 'convex/server';

/** Shared browser seam: real Convex subscriptions or the Site's same-origin HTTP service. */
export interface SessionClient {
  action<F extends FunctionReference<'action'>>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>>;
  query<F extends FunctionReference<'query'>>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>>;
  mutation<F extends FunctionReference<'mutation'>>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>>;
  onUpdate<F extends FunctionReference<'query'>>(
    ref: F,
    args: FunctionArgs<F>,
    callback: (result: FunctionReturnType<F>) => unknown,
    onError?: (error: Error) => unknown,
  ): () => void;
  subscribeToConnectionState(
    callback: (state: { isWebSocketConnected: boolean }) => void,
  ): () => void;
  close(): Promise<void>;
}
interface Poll {
  pause(): void;
  resume(): void;
  stop(): void;
}
const operations = new Set([
  'create',
  'join',
  'read',
  'commit',
  'presence',
  'peers',
]);

/** Private capabilities travel only in POST bodies to fixed same-origin endpoints. */
export class HttpSessionClient implements SessionClient {
  private closed = false;
  private connected = false;
  private readonly requests = new Set<AbortController>();
  private readonly polls = new Set<Poll>();
  private readonly listeners = new Set<
    (state: { isWebSocketConnected: boolean }) => void
  >();
  private readonly visibility = () => {
    this.polls.forEach((poll) =>
      document.visibilityState === 'hidden' ? poll.pause() : poll.resume(),
    );
  };
  constructor() {
    document.addEventListener('visibilitychange', this.visibility);
  }
  private connection(connected: boolean) {
    if (this.closed || this.connected === connected) return;
    this.connected = connected;
    this.listeners.forEach((callback) =>
      callback({ isWebSocketConnected: connected }),
    );
  }
  private async request<
    F extends FunctionReference<'action' | 'query' | 'mutation'>,
  >(
    ref: F,
    args: FunctionArgs<F>,
    controller = new AbortController(),
  ): Promise<FunctionReturnType<F>> {
    if (this.closed) throw new Error('Session client closed.');
    const name = getFunctionName(ref);
    const op = name.startsWith('sessions:')
      ? name.slice('sessions:'.length)
      : '';
    if (!operations.has(op)) throw new Error('Unsupported session operation.');
    this.requests.add(controller);
    const timeout = setTimeout(
      () => controller.abort('session-timeout'),
      15000,
    );
    try {
      const response = await fetch('/api/sessions/' + op, {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        keepalive: op === 'presence',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const error = (body as { error?: unknown })?.error;
        const code =
          typeof error === 'string'
            ? error
            : error && typeof error === 'object' && 'code' in error
              ? error.code
              : null;
        throw new Error(
          typeof code === 'string'
            ? code
            : 'Session request failed (' + response.status + ').',
        );
      }
      this.connection(true);
      return body as FunctionReturnType<F>;
    } catch (error) {
      const timedOut = controller.signal.reason === 'session-timeout';
      if (timedOut || !controller.signal.aborted) this.connection(false);
      throw timedOut ? new Error('Session request timed out.') : error;
    } finally {
      clearTimeout(timeout);
      this.requests.delete(controller);
    }
  }
  action<F extends FunctionReference<'action'>>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>> {
    return this.request(ref, args);
  }
  query<F extends FunctionReference<'query'>>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>> {
    return this.request(ref, args);
  }
  mutation<F extends FunctionReference<'mutation'>>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>> {
    return this.request(ref, args);
  }
  onUpdate<F extends FunctionReference<'query'>>(
    ref: F,
    args: FunctionArgs<F>,
    callback: (result: FunctionReturnType<F>) => unknown,
    onError?: (error: Error) => unknown,
  ): () => void {
    const name = getFunctionName(ref);
    if (name !== 'sessions:read' && name !== 'sessions:peers')
      throw new Error('Unsupported session subscription.');
    const interval = name === 'sessions:read' ? 750 : 150;
    let stopped = false;
    let running = false;
    let failures = 0;
    let lastError = '';
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    const schedule = (delay: number) => {
      if (
        stopped ||
        this.closed ||
        document.visibilityState === 'hidden' ||
        timer ||
        running
      )
        return;
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, delay);
    };
    const run = async () => {
      if (stopped || this.closed || document.visibilityState === 'hidden')
        return;
      running = true;
      const request = new AbortController();
      controller = request;
      try {
        const result = await this.request(ref, args, request);
        if (!stopped && !this.closed && !request.signal.aborted)
          callback(result);
        failures = 0;
        lastError = '';
      } catch (error) {
        if (
          !stopped &&
          !this.closed &&
          (!request.signal.aborted ||
            request.signal.reason === 'session-timeout')
        ) {
          failures++;
          const e =
            error instanceof Error
              ? error
              : new Error('Session request failed.');
          if (e.message !== lastError) onError?.(e);
          lastError = e.message;
        }
      } finally {
        controller = null;
        running = false;
        schedule(
          failures
            ? Math.min(5000, interval * 2 ** Math.min(failures, 5))
            : interval,
        );
      }
    };
    const poll: Poll = {
      pause: () => {
        if (timer) clearTimeout(timer);
        timer = null;
        controller?.abort();
      },
      resume: () => schedule(0),
      stop: () => {
        stopped = true;
        poll.pause();
        this.polls.delete(poll);
      },
    };
    this.polls.add(poll);
    schedule(0);
    return poll.stop;
  }
  subscribeToConnectionState(
    callback: (state: { isWebSocketConnected: boolean }) => void,
  ): () => void {
    if (this.closed) return () => {};
    this.listeners.add(callback);
    callback({ isWebSocketConnected: this.connected });
    return () => {
      this.listeners.delete(callback);
    };
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.polls.forEach((poll) => poll.stop());
    this.requests.forEach((request) => request.abort());
    this.listeners.clear();
    document.removeEventListener('visibilitychange', this.visibility);
  }
}
