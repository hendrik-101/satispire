import { ConvexError } from 'convex/values';
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from 'convex/server';

/** Shared browser seam: real Convex subscriptions or the Site's same-origin HTTP service. */
export interface RoomClient {
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
  connectionState(): { isWebSocketConnected: boolean };
  subscribeToConnectionState(
    callback: (state: { isWebSocketConnected: boolean }) => void,
  ): () => void;
  close(): Promise<void>;
}
/** A failed HTTP exchange that can be repeated using the original idempotent command. */
export class RetryableHttpRoomError extends Error {
  readonly retryable = true;
}
class HttpResponseError extends Error {}
const retryableStatus = (status: number) =>
  status === 408 || status === 429 || status >= 500;

interface Poll {
  pause(): void;
  resume(): void;
  stop(): void;
}
const operations = new Set([
  'create',
  'join',
  'view',
  'edit',
  'undo',
  'history',
]);

/** Private capabilities travel only in POST bodies to fixed same-origin endpoints. */
export class HttpRoomClient implements RoomClient {
  private closed = false;
  private connected = false;
  private readonly requests = new Set<AbortController>();
  private readonly polls = new Set<Poll>();
  private readonly retryWaits = new Set<() => void>();
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
    payload = JSON.stringify(args),
  ): Promise<FunctionReturnType<F>> {
    if (this.closed) throw new Error('Room client closed.');
    const name = getFunctionName(ref);
    const op = name.startsWith('plans:') ? name.slice('plans:'.length) : '';
    if (!operations.has(op)) throw new Error('Unsupported room operation.');
    this.requests.add(controller);
    const timeout = setTimeout(() => controller.abort('room-timeout'), 15000);
    try {
      const response = await fetch('/api/rooms/' + op, {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: controller.signal,
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        const ErrorType =
          response.ok || retryableStatus(response.status)
            ? RetryableHttpRoomError
            : HttpResponseError;
        throw new ErrorType(
          'Room request returned invalid JSON (' + response.status + ').',
        );
      }
      if (!response.ok) {
        const error = (body as { error?: unknown })?.error;
        const code =
          typeof error === 'string'
            ? error
            : error && typeof error === 'object' && 'code' in error
              ? error.code
              : null;
        const message =
          typeof code === 'string'
            ? code
            : 'Room request failed (' + response.status + ').';
        const permanent =
          /conflict|forbidden|invalid|validation|command-id-reused|too-large|not-found|json-required|method-not-allowed/.test(
            message,
          );
        const ErrorType =
          retryableStatus(response.status) && !permanent
            ? RetryableHttpRoomError
            : null;
        if (ErrorType) throw new ErrorType(message);
        if (typeof code === 'string') throw new ConvexError({ code });
        throw new HttpResponseError(message);
      }
      this.connection(true);
      return body as FunctionReturnType<F>;
    } catch (error) {
      const timedOut = controller.signal.reason === 'room-timeout';
      if (timedOut || !controller.signal.aborted) this.connection(false);
      if (timedOut) throw new RetryableHttpRoomError('Room request timed out.');
      if (
        controller.signal.aborted ||
        error instanceof ConvexError ||
        error instanceof HttpResponseError ||
        error instanceof RetryableHttpRoomError
      )
        throw error;
      throw new RetryableHttpRoomError(
        error instanceof Error ? error.message : 'Room request failed.',
      );
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
  private waitForRetry(delay: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error('Room client closed.'));
        return;
      }
      const cancel = () => {
        clearTimeout(timer);
        this.retryWaits.delete(cancel);
        reject(new Error('Room client closed.'));
      };
      const timer = setTimeout(() => {
        this.retryWaits.delete(cancel);
        resolve();
      }, delay);
      this.retryWaits.add(cancel);
    });
  }
  async mutation<F extends FunctionReference<'mutation'>>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>> {
    const name = getFunctionName(ref);
    if (name !== 'plans:edit' && name !== 'plans:undo')
      return this.request(ref, args);
    // Serialize once: retries must carry the same command ID and content even if
    // caller-owned data changes while the acknowledgement is outstanding.
    const payload = JSON.stringify(args);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.request(ref, args, new AbortController(), payload);
      } catch (error) {
        if (
          this.closed ||
          !(error instanceof RetryableHttpRoomError) ||
          attempt === 2
        )
          throw error;
        await this.waitForRetry(250 * 2 ** attempt);
      }
    }
  }
  onUpdate<F extends FunctionReference<'query'>>(
    ref: F,
    args: FunctionArgs<F>,
    callback: (result: FunctionReturnType<F>) => unknown,
    onError?: (error: Error) => unknown,
  ): () => void {
    const name = getFunctionName(ref);
    if (name !== 'plans:view' && name !== 'plans:history')
      throw new Error('Unsupported room subscription.');
    const interval = 750;
    let stopped = false;
    let running = false;
    let failures = 0;
    let lastError = '';
    let lastSnapshot: string | undefined;
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
        if (!stopped && !this.closed && !request.signal.aborted) {
          const revision =
            name === 'plans:view' &&
            result &&
            typeof result === 'object' &&
            'revision' in result
              ? result.revision
              : undefined;
          const snapshot =
            typeof revision === 'number'
              ? 'revision:' + revision
              : JSON.stringify(result);
          if (snapshot !== lastSnapshot || failures > 0) {
            lastSnapshot = snapshot;
            callback(result);
          }
        }
        failures = 0;
        lastError = '';
      } catch (error) {
        if (
          !stopped &&
          !this.closed &&
          (!request.signal.aborted || request.signal.reason === 'room-timeout')
        ) {
          failures++;
          const e =
            error instanceof Error ? error : new Error('Room request failed.');
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
  connectionState(): { isWebSocketConnected: boolean } {
    return { isWebSocketConnected: !this.closed && this.connected };
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
    this.retryWaits.forEach((cancel) => cancel());
    this.listeners.clear();
    document.removeEventListener('visibilitychange', this.visibility);
  }
}
