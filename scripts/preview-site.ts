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
  fetch: (request) => worker.fetch(request, { DB }),
}).ready();
console.log('Site acceptance server listening on http://127.0.0.1:4178');
