import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { serve } from 'srvx/node';
import type { SessionStatement } from '../src/runtime/site-sessions.js';
import type { RoomDatabase } from '../src/runtime/site-rooms.js';
const database = new DatabaseSync(':memory:');
database.exec(
  readFileSync(
    new URL('../deploy/session-migration.sql', import.meta.url),
    'utf8',
  ),
);
database.exec(
  readFileSync(
    new URL('../deploy/room-migration.sql', import.meta.url),
    'utf8',
  ),
);
const executions = new WeakMap<
  SessionStatement,
  () => { meta: { changes: number } }
>();
const DB: RoomDatabase = {
  prepare(query: string) {
    const statement = database.prepare(query);
    let values: SQLInputValue[] = [];
    const prepared: SessionStatement = {
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
    executions.set(prepared, () => ({
      meta: { changes: Number(statement.run(...values).changes) },
    }));
    return prepared;
  },
  async batch(statements) {
    database.exec('BEGIN');
    try {
      const results = statements.map((statement) => {
        const execute = executions.get(statement);
        if (!execute) throw new Error('Unknown prepared statement');
        return execute();
      });
      database.exec('COMMIT');
      return results;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
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
