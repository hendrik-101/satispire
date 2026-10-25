import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  handleSessionRequest,
  type SessionDatabase,
  type SessionStatement,
} from '../src/runtime/site-sessions';
import { vanillaCatalog } from '../src/domain/vanilla';
import { defaultBuildVariant } from '../src/domain/build-variants';
import { createUnlockProfile } from '../src/domain/session-unlocks';
const plan = {
  schemaVersion: 1,
  catalogVersion: vanillaCatalog.catalogVersion,
  production: {
    targets: [{ itemId: 'Desc_IronPlate_C', rate: '20' }],
    recipes: {
      Desc_IronPlate_C: 'Recipe_IronPlate_C',
      Desc_IronIngot_C: 'Recipe_IngotIron_C',
    },
    imports: ['Desc_OreIron_C'],
  },
  layout: { rows: 0, variant: defaultBuildVariant },
};
function harness(sqlite = new DatabaseSync(':memory:')) {
  const db: SessionDatabase = {
    prepare(sql) {
      let args: SQLInputValue[] = [];
      const st: SessionStatement = {
        bind(...values) {
          args = values;
          return st;
        },
        async first<T>() {
          return (sqlite.prepare(sql).get(...args) ?? null) as T | null;
        },
        async all<T>() {
          return { results: sqlite.prepare(sql).all(...args) as T[] };
        },
        async run() {
          const r = sqlite.prepare(sql).run(...args);
          return { meta: { changes: Number(r.changes) } };
        },
      };
      return st;
    },
  };
  return { sqlite, db };
}
const call = (
  db: SessionDatabase,
  op: string,
  args: unknown,
  headers: Record<string, string> = {},
) =>
  handleSessionRequest(
    new Request('https://site.test/api/sessions/' + op, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://site.test',
        ...headers,
      },
      body: JSON.stringify(args),
    }),
    db,
  );
const auth = (m: Record<string, string>) => ({
  sessionId: m.sessionId,
  capability: m.capability,
});
function setup() {
  const h = harness();
  h.sqlite.exec(readFileSync('deploy/session-migration.sql', 'utf8'));
  return h;
}
describe('Sites durable D1 sessions', () => {
  it('persists across handles and validates atomic revisions, capabilities and retries', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'site-sessions-'));
    const file = join(directory, 'sessions.sqlite');
    const { db, sqlite } = harness(new DatabaseSync(file));
    sqlite.exec(readFileSync('deploy/session-migration.sql', 'utf8'));
    const a = await (await call(db, 'create', { name: 'Alice', plan })).json();
    expect(a.sessionId).toMatch(/^[a-f0-9]{64}$/);
    const b = await (
      await call(db, 'join', { sessionId: a.sessionId, name: 'Bob' })
    ).json();
    const second = new DatabaseSync(file);
    expect(
      await (await call(harness(second).db, 'read', auth(b))).json(),
    ).toEqual({ revision: 0, plan });
    second.close();
    const edit = { ...auth(a), id: 'save', expectedRevision: 0, plan };
    expect(await (await call(db, 'commit', edit)).json()).toEqual({
      revision: 1,
      duplicate: false,
    });
    expect(await (await call(db, 'commit', edit)).json()).toEqual({
      revision: 1,
      duplicate: true,
    });
    expect((await call(db, 'commit', { ...edit, id: 'stale' })).status).toBe(
      409,
    );
    const other = await (
      await call(db, 'create', { name: 'Other', plan })
    ).json();
    for (const op of ['read', 'commit', 'presence', 'peers'])
      expect(
        (
          await call(db, op, {
            ...edit,
            capability: other.capability,
            clientId: 'tab',
            view: 'layout',
            floor: 'iron',
            cursor: null,
          })
        ).status,
      ).toBe(403);
    const bad = {
      ...plan,
      unlocks: { ...createUnlockProfile(9), spaceElevatorPhase: 0 },
    };
    expect(
      (
        await call(db, 'commit', {
          ...edit,
          id: 'poison',
          expectedRevision: 1,
          plan: bad,
        })
      ).status,
    ).toBe(400);
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  });
  it('keeps scoped expiring cursors independent and rejects oversized/cross-origin bodies', async () => {
    const { db, sqlite } = setup();
    const a = await (await call(db, 'create', { name: 'Alice', plan })).json();
    const b = await (
      await call(db, 'join', { sessionId: a.sessionId, name: 'Bob' })
    ).json();
    await call(db, 'presence', {
      ...auth(b),
      clientId: 'tab',
      view: 'layout',
      floor: 'iron',
      cursor: { x: 3, y: 4 },
    });
    expect(
      await (
        await call(db, 'peers', { ...auth(a), view: 'layout', floor: 'iron' })
      ).json(),
    ).toMatchObject([{ name: 'Bob', cursor: { x: 3, y: 4 } }]);
    expect(
      await (
        await call(db, 'peers', { ...auth(a), view: 'layout', floor: 'other' })
      ).json(),
    ).toEqual([]);
    sqlite
      .prepare('UPDATE site_session_presence SET updated_at=?')
      .run(Date.now() - 16000);
    expect(
      await (
        await call(db, 'peers', { ...auth(a), view: 'layout', floor: 'iron' })
      ).json(),
    ).toEqual([]);
    expect((await (await call(db, 'read', auth(a))).json()).revision).toBe(0);
    expect(
      (
        await call(
          db,
          'create',
          { name: 'Alice', plan },
          { Origin: 'https://evil.test' },
        )
      ).status,
    ).toBe(403);
    expect(
      (await call(db, 'create', { name: 'x'.repeat(310000), plan })).status,
    ).toBe(413);
    sqlite.close();
  });
  it('enforces member/tab bounds and concurrent compare-and-swap writes', async () => {
    const { db, sqlite } = setup();
    const a = await (await call(db, 'create', { name: 'Alice', plan })).json();
    const writes = await Promise.all(
      ['one', 'two'].map((id) =>
        call(db, 'commit', { ...auth(a), id, expectedRevision: 0, plan }),
      ),
    );
    expect(writes.map((r) => r.status).sort()).toEqual([200, 409]);
    const presence = {
      ...auth(a),
      view: 'layout',
      floor: 'iron',
      cursor: null,
    };
    for (let i = 0; i < 8; i++)
      expect(
        (await call(db, 'presence', { ...presence, clientId: `tab-${i}` }))
          .status,
      ).toBe(200);
    expect(
      (await call(db, 'presence', { ...presence, clientId: 'ninth' })).status,
    ).toBe(409);
    expect(
      (await call(db, 'presence', { ...presence, clientId: 'tab-0' })).status,
    ).toBe(200);
    const insert = sqlite.prepare(
      'INSERT INTO site_session_members(digest,session_id,participant_id,name,color) VALUES (?,?,?,?,?)',
    );
    for (let i = 0; i < 127; i++)
      insert.run(
        `digest-${i}`,
        a.sessionId,
        `member-${i}`,
        'Member',
        '#f39a45',
      );
    expect(
      (await call(db, 'join', { sessionId: a.sessionId, name: 'Overflow' }))
        .status,
    ).toBe(403);
    expect(
      (
        sqlite
          .prepare('SELECT COUNT(*) AS count FROM site_session_members')
          .get() as { count: number }
      ).count,
    ).toBe(128);
    sqlite.close();
  });
  it('caps streamed bodies without trusting length and returns generic protocol errors', async () => {
    const { db, sqlite } = setup();
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(102400));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request('https://site.test/api/sessions/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect((await handleSessionRequest(request, db)).status).toBe(413);
    expect(cancelled).toBe(true);
    expect(
      (
        await call(
          db,
          'create',
          { name: 'Alice', plan },
          { 'Sec-Fetch-Site': 'cross-site' },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          db,
          'create',
          { name: 'Alice', plan },
          { 'Content-Type': 'text/plain' },
        )
      ).status,
    ).toBe(415);
    const malformed = await handleSessionRequest(
      new Request('https://site.test/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }),
      db,
    );
    expect(await malformed.json()).toEqual({ error: { code: 'invalid-json' } });
    sqlite.close();
  });
  it('charges invalid creation attempts and leaves existing sessions usable when limited', async () => {
    const { db, sqlite } = setup();
    const a = await (await call(db, 'create', { name: 'Alice', plan })).json();
    for (let i = 0; i < 4; i++)
      expect((await call(db, 'create', { name: 'Bad', plan: {} })).status).toBe(
        400,
      );
    expect((await call(db, 'create', { name: 'Alice', plan })).status).toBe(
      429,
    );
    expect((await call(db, 'read', auth(a))).status).toBe(200);
    expect(
      (await call(db, 'join', { sessionId: a.sessionId, name: 'Bob' })).status,
    ).toBe(200);
    sqlite
      .prepare('UPDATE site_session_admission SET window_start=?')
      .run(Date.now() - 60001);
    expect((await call(db, 'create', { name: 'New', plan })).status).toBe(200);
    sqlite.close();
  });
  it('caps durable sessions atomically without removing saved plans', async () => {
    const { db, sqlite } = setup();
    const insert = sqlite.prepare(
      'INSERT INTO site_sessions(session_id,plan_json) VALUES (?,?)',
    );
    for (let i = 0; i < 511; i++)
      insert.run(`existing-${i}`, JSON.stringify(plan));
    const results = await Promise.all([
      call(db, 'create', { name: 'A', plan }),
      call(db, 'create', { name: 'B', plan }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 503]);
    expect(
      (
        sqlite.prepare('SELECT COUNT(*) count FROM site_sessions').get() as {
          count: number;
        }
      ).count,
    ).toBe(512);
    sqlite.close();
  });
});
