import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { serve } from 'srvx/node';
import type { SessionDatabase } from '../src/runtime/site-sessions.js';
const database = new DatabaseSync(':memory:');
database.exec(
  readFileSync(
    new URL('../deploy/session-migration.sql', import.meta.url),
    'utf8',
  ),
);
const DB: SessionDatabase = {
  prepare(query: string) {
    const statement = database.prepare(query);
    let values: SQLInputValue[] = [];
    return {
      bind(...args: SQLInputValue[]) {
        values = args;
        return this;
      },
      async first<T>() {
        return (statement.get(...values) as T | undefined) ?? null;
      },
      async all<T>() {
        return { results: statement.all(...values) as T[] };
      },
      async run() {
        return { meta: { changes: Number(statement.run(...values).changes) } };
      },
    };
  },
};
const worker = (
  await import(new URL('../site-dist/server/index.js', import.meta.url).href)
).default;
await serve({
  hostname: '127.0.0.1',
  port: 4178,
  silent: true,
  fetch: async (request) => {
    // The loopback preview is the trusted server boundary; overwrite any caller-supplied value.
    const headers = new Headers(request.headers);
    headers.set('CF-Connecting-IP', '127.0.0.1');
    const body =
      request.method === 'GET' || request.method === 'HEAD'
        ? null
        : await request.arrayBuffer();
    return worker.fetch(
      new Request(request.url, {
        method: request.method,
        headers,
        ...(body ? { body } : {}),
        signal: request.signal,
      }),
      { DB },
    );
  },
}).ready();
console.log('Site acceptance server listening on http://127.0.0.1:4178');
