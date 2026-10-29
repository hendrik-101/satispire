import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  handleRoomRequest,
  type RoomDatabase,
} from '../src/runtime/site-rooms';
import type { SessionStatement } from '../src/runtime/site-sessions';
import { initialSharedPlan } from '../src/domain/shared-plan';
import type { Membership } from '../src/room-api';

function harness(sqlite = new DatabaseSync(':memory:')) {
  const statements = new WeakMap<
    SessionStatement,
    () => { meta: { changes: number } }
  >();
  const db: RoomDatabase = {
    prepare(sql) {
      let args: SQLInputValue[] = [];
      const execute = () => ({
        meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) },
      });
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
          return execute();
        },
      };
      statements.set(st, execute);
      return st;
    },
    async batch(batch) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = batch.map((st) => statements.get(st)!());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db, sqlite };
}
function setup() {
  const h = harness();
  h.sqlite.exec(readFileSync('deploy/room-migration.sql', 'utf8'));
  return h;
}
const auth = (m: Membership) => ({
  roomId: m.roomId,
  capability: m.capability,
});
const call = (
  db: RoomDatabase,
  op: string,
  args: unknown,
  actorKey: string | undefined = 'trusted-caller',
  headers: Record<string, string> = {},
) =>
  handleRoomRequest(
    new Request('https://site.test/api/rooms/' + op, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(args),
    }),
    db,
    actorKey,
  );
const create = async (db: RoomDatabase, actor = 'trusted-caller') =>
  (
    await call(
      db,
      'create',
      { name: 'Alice', plan: initialSharedPlan() },
      actor,
    )
  ).json() as Promise<Membership & { shareSecret: string }>;
const history = async (
  db: RoomDatabase,
  member: Membership,
  cursor: string | null = null,
  numItems = 50,
) =>
  (
    await call(db, 'history', {
      ...auth(member),
      paginationOpts: { numItems, cursor },
    })
  ).json();
const edit = (
  member: Membership,
  id: string,
  expectedRevision: number,
  rows: number,
) => {
  const plan = initialSharedPlan();
  plan.layout.rows = rows;
  return { ...auth(member), id, expectedRevision, plan };
};

describe('D1 shared rooms', () => {
  it('persists reusable links, hashes secrets and survives database reopen', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'site-rooms-'));
    const path = join(directory, 'rooms.sqlite');
    const { db, sqlite } = harness(new DatabaseSync(path));
    sqlite.exec(readFileSync('deploy/room-migration.sql', 'utf8'));
    const owner = await create(db);
    expect(owner.roomId).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    const members = [];
    for (const name of ['Bob', 'Carol']) {
      const joined = await call(db, 'join', {
        roomId: owner.roomId,
        shareSecret: owner.shareSecret,
        name,
      });
      expect(joined.status).toBe(200);
      members.push(await joined.json());
    }
    expect(new Set(members.map((m) => m.capability)).size).toBe(2);
    const persisted = JSON.stringify([
      sqlite.prepare('SELECT * FROM site_rooms').all(),
      sqlite.prepare('SELECT * FROM site_room_members').all(),
    ]);
    for (const secret of [
      owner.capability,
      owner.shareSecret,
      ...members.map((m) => m.capability),
    ])
      expect(persisted).not.toContain(secret);
    const command = edit(owner, 'persisted', 0, 2);
    expect(await (await call(db, 'edit', command)).json()).toEqual({
      revision: 1,
      duplicate: false,
    });
    sqlite.close();
    const reopened = harness(new DatabaseSync(path));
    expect(
      await (await call(reopened.db, 'view', auth(members[0]))).json(),
    ).toMatchObject({ revision: 1, plan: { layout: { rows: 2 } } });
    expect(await (await call(reopened.db, 'edit', command)).json()).toEqual({
      revision: 1,
      duplicate: true,
    });
    expect((await history(reopened.db, owner)).page).toHaveLength(1);
    reopened.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('makes concurrent different IDs conflict without orphan receipts or history', async () => {
    const { db, sqlite } = setup();
    const owner = await create(db);
    const commands = [edit(owner, 'one', 0, 2), edit(owner, 'two', 0, 4)];
    const results = await Promise.all(commands.map((a) => call(db, 'edit', a)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      sqlite.prepare('SELECT * FROM site_room_receipts').all(),
    ).toHaveLength(1);
    expect((await history(db, owner)).page).toHaveLength(1);
    const loser = commands[results.findIndex((r) => r.status === 409)]!;
    expect(
      (await call(db, 'edit', { ...loser, expectedRevision: 1 })).status,
    ).toBe(200);
    expect((await history(db, owner)).page).toHaveLength(2);
    sqlite.close();
  });

  it('deduplicates concurrent identical commands and rejects mismatched reused IDs', async () => {
    const { db, sqlite } = setup();
    const owner = await create(db);
    const command = edit(owner, 'same', 0, 2);
    const results = await Promise.all([
      call(db, 'edit', command),
      call(db, 'edit', command),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const values = await Promise.all(results.map((r) => r.json()));
    expect(values.map((r) => r.duplicate).sort()).toEqual([false, true]);
    expect((await history(db, owner)).page).toHaveLength(1);
    expect(
      await (await call(db, 'edit', edit(owner, 'same', 0, 4))).json(),
    ).toEqual({ error: { code: 'command-id-reused' } });
    const joined = await (
      await call(db, 'join', {
        roomId: owner.roomId,
        shareSecret: owner.shareSecret,
        name: 'Bob',
      })
    ).json();
    expect(
      (await call(db, 'edit', { ...command, ...auth(joined) })).status,
    ).toBe(409);
    expect((await call(db, 'edit', edit(owner, 'stale', 0, 4))).status).toBe(
      409,
    );
    expect(
      sqlite.prepare('SELECT * FROM site_room_receipts').all(),
    ).toHaveLength(1);
    sqlite.close();
  });

  it('keeps no-op revisions stable and retains receipts beyond the old 128 receipt window', async () => {
    const { db, sqlite } = setup();
    const owner = await create(db);
    for (let i = 0; i < 130; i++)
      expect(
        await (await call(db, 'edit', edit(owner, 'noop-' + i, 0, 0))).json(),
      ).toEqual({ revision: 0, duplicate: false });
    expect(
      await (await call(db, 'edit', edit(owner, 'noop-0', 0, 0))).json(),
    ).toEqual({ revision: 0, duplicate: true });
    expect((await history(db, owner)).page).toHaveLength(0);
    expect((await call(db, 'edit', edit(owner, 'changed', 0, 2))).status).toBe(
      200,
    );
    expect(
      await (await call(db, 'edit', edit(owner, 'noop-0', 0, 0))).json(),
    ).toEqual({ revision: 0, duplicate: true });
    sqlite.close();
  });

  it('paginates per room and undoes fields while preserving later unrelated changes', async () => {
    const { db, sqlite } = setup();
    const owner = await create(db);
    const other = await create(db, 'other');
    await call(db, 'edit', edit(owner, 'rows', 0, 2));
    const targets = edit(owner, 'targets', 1, 2);
    targets.plan.production.targets[0]!.rate = '40';
    await call(db, 'edit', targets);
    const page = await history(db, owner, null, 1);
    expect(page.page[0]).toMatchObject({
      revision: 2,
      author: 'Alice',
      summary: 'Outputs',
    });
    expect(page.isDone).toBe(false);
    const older = await history(db, owner, page.continueCursor, 1);
    expect(older.page[0].revision).toBe(1);
    expect(older.isDone).toBe(true);
    expect(
      (
        await call(db, 'undo', {
          ...auth(other),
          id: 'foreign',
          expectedRevision: 0,
          entryId: older.page[0].id,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(db, 'history', {
          ...auth(other),
          paginationOpts: { numItems: 1, cursor: page.continueCursor },
        })
      ).status,
    ).toBe(400);
    const undo = {
      ...auth(owner),
      id: 'undo',
      expectedRevision: 2,
      entryId: older.page[0].id,
    };
    expect(await (await call(db, 'undo', undo)).json()).toEqual({
      revision: 3,
      duplicate: false,
    });
    expect(await (await call(db, 'undo', undo)).json()).toEqual({
      revision: 3,
      duplicate: true,
    });
    expect(await (await call(db, 'view', auth(owner))).json()).toMatchObject({
      revision: 3,
      plan: { layout: { rows: 0 }, production: { targets: [{ rate: '40' }] } },
    });
    const newest = (await history(db, owner)).page[0];
    expect(newest.undoOf).toBe(older.page[0].id);
    expect(
      (
        await call(db, 'undo', {
          ...auth(owner),
          id: 'undo-again',
          expectedRevision: 3,
          entryId: older.page[0].id,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(db, 'undo', {
          ...auth(owner),
          id: 'redo',
          expectedRevision: 3,
          entryId: newest.id,
        })
      ).status,
    ).toBe(200);
    for (const numItems of [0, 51, 1.5])
      expect(
        (
          await call(db, 'history', {
            ...auth(owner),
            paginationOpts: { numItems, cursor: null },
          })
        ).status,
      ).toBe(400);
    sqlite.close();
  });

  it('rejects foreign secrets, invalid plans, commands, origins and missing atomic storage', async () => {
    const { db, sqlite } = setup();
    const owner = await create(db);
    const other = await create(db, 'other');
    expect(
      (
        await call(db, 'join', {
          roomId: other.roomId,
          shareSecret: owner.shareSecret,
          name: 'X',
        })
      ).status,
    ).toBe(403);
    for (const op of ['view', 'history', 'edit', 'undo'])
      expect(
        (
          await call(db, op, {
            ...edit(owner, 'x', 0, 2),
            capability: other.capability,
          })
        ).status,
      ).toBe(403);
    expect(
      (await call(db, 'view', { ...auth(owner), roomId: 'invalid' })).status,
    ).toBe(403);
    expect(
      (await call(db, 'edit', { ...edit(owner, 'bad', 0, 2), plan: {} }))
        .status,
    ).toBe(400);
    expect((await call(db, 'edit', edit(owner, 'bad id', 0, 2))).status).toBe(
      400,
    );
    expect(
      (await call(db, 'edit', edit(owner, 'bad', Number.MAX_SAFE_INTEGER, 2)))
        .status,
    ).toBe(400);
    expect(
      (
        await call(
          db,
          'create',
          { name: 'Alice', plan: { data: 'x'.repeat(180001) } },
          'size',
        )
      ).status,
    ).toBe(413);
    expect(
      (await call(db, 'create', { name: 'x'.repeat(310000) }, 'body')).status,
    ).toBe(413);
    expect(
      (
        await call(db, 'view', auth(owner), undefined, {
          Origin: 'https://evil.test',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(db, 'view', auth(owner), undefined, {
          'Sec-Fetch-Site': 'cross-site',
        })
      ).status,
    ).toBe(403);
    const noBatch = { prepare: db.prepare };
    expect((await call(noBatch, 'view', auth(owner))).status).toBe(200);
    expect(
      await (await call(noBatch, 'edit', edit(owner, 'no-batch', 0, 2))).json(),
    ).toEqual({ error: { code: 'storage-unavailable' } });
    sqlite.close();
  });

  it('bounds admission by trusted caller and members without disabling saved rooms', async () => {
    const { db, sqlite } = setup();
    const owner = await create(db);
    for (let i = 0; i < 4; i++)
      expect((await call(db, 'create', { name: 'Bad', plan: {} })).status).toBe(
        400,
      );
    expect(
      (
        await call(
          db,
          'create',
          { name: 'Alice', plan: initialSharedPlan(), actorKey: 'spoof' },
          undefined,
          { 'CF-Connecting-IP': 'spoof' },
        )
      ).status,
    ).toBe(429);
    expect((await call(db, 'view', auth(owner))).status).toBe(200);
    const insert = sqlite.prepare(
      'INSERT INTO site_room_members(digest,room_id,participant_id,name) VALUES (?,?,?,?)',
    );
    for (let i = 0; i < 127; i++)
      insert.run('hash-' + i, owner.roomId, 'member-' + i, 'Member');
    expect(
      (
        await call(db, 'join', {
          roomId: owner.roomId,
          shareSecret: owner.shareSecret,
          name: 'Overflow',
        })
      ).status,
    ).toBe(403);
    expect(
      sqlite.prepare('SELECT * FROM site_room_members').all(),
    ).toHaveLength(128);
    sqlite
      .prepare('UPDATE site_room_caller_admission SET window_start=?')
      .run(Date.now() - 60001);
    expect(
      (await call(db, 'create', { name: 'Reset', plan: initialSharedPlan() }))
        .status,
    ).toBe(200);
    expect(
      JSON.stringify(
        sqlite.prepare('SELECT * FROM site_room_caller_admission').all(),
      ),
    ).not.toContain('trusted-caller');
    expect(
      (
        await handleRoomRequest(
          new Request('https://site.test/api/rooms/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: 'Missing',
              plan: initialSharedPlan(),
            }),
          }),
          db,
        )
      ).status,
    ).toBe(503);
    sqlite.close();
  });

  it('enforces the global 512-room cap atomically', async () => {
    const { db, sqlite } = setup();
    const insert = sqlite.prepare(
      'INSERT INTO site_rooms(room_id,plan_json,share_digest) VALUES (?,?,?)',
    );
    for (let i = 0; i < 511; i++) insert.run('existing-' + i, '{}', 'digest');
    const results = await Promise.all(
      ['one', 'two'].map((actor) =>
        call(db, 'create', { name: 'A', plan: initialSharedPlan() }, actor),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 503]);
    expect(sqlite.prepare('SELECT * FROM site_rooms').all()).toHaveLength(512);
    expect(
      sqlite.prepare('SELECT * FROM site_room_members').all(),
    ).toHaveLength(1);
    sqlite.close();
  });

  it('recognizes a retry that completes between its receipt and state reads', async () => {
    const { db, sqlite } = setup();
    const owner = await create(db);
    const command = edit(owner, 'interleaved', 0, 2);
    let interleaved = false;
    const racing: RoomDatabase = {
      batch: db.batch!,
      prepare(sql) {
        const st = db.prepare(sql);
        if (!sql.startsWith('SELECT revision,plan_json')) return st;
        const first = st.first.bind(st);
        st.first = async <T>() => {
          if (!interleaved) {
            interleaved = true;
            expect((await call(db, 'edit', command)).status).toBe(200);
          }
          return first<T>();
        };
        return st;
      },
    };
    expect(await (await call(racing, 'edit', command)).json()).toEqual({
      revision: 1,
      duplicate: true,
    });
    expect((await history(db, owner)).page).toHaveLength(1);
    sqlite.close();
  });

  it('rolls back a successful CAS if a dependent persistence statement fails', async () => {
    const { db, sqlite } = setup();
    const owner = await create(db);
    sqlite.exec(
      "CREATE TRIGGER fail_receipt BEFORE INSERT ON site_room_receipts BEGIN SELECT RAISE(ABORT, 'fixture failure'); END",
    );
    expect((await call(db, 'edit', edit(owner, 'rollback', 0, 2))).status).toBe(
      500,
    );
    expect(await (await call(db, 'view', auth(owner))).json()).toMatchObject({
      revision: 0,
      plan: { layout: { rows: 0 } },
    });
    expect(
      sqlite.prepare('SELECT * FROM site_room_receipts').all(),
    ).toHaveLength(0);
    expect((await history(db, owner)).page).toHaveLength(0);
    sqlite.exec('DROP TRIGGER fail_receipt');
    expect((await call(db, 'edit', edit(owner, 'rollback', 0, 2))).status).toBe(
      200,
    );
    sqlite.close();
  });

  it('rejects revoked and viewer writes while preserving viewer reads', async () => {
    const { db, sqlite } = setup();
    const owner = await create(db);
    sqlite
      .prepare(
        "UPDATE site_room_members SET role='viewer' WHERE participant_id=?",
      )
      .run(owner.participantId);
    expect((await call(db, 'view', auth(owner))).status).toBe(200);
    expect(
      (
        await call(db, 'history', {
          ...auth(owner),
          paginationOpts: { numItems: 1, cursor: null },
        })
      ).status,
    ).toBe(200);
    expect((await call(db, 'edit', edit(owner, 'viewer', 0, 2))).status).toBe(
      403,
    );
    sqlite
      .prepare('DELETE FROM site_room_members WHERE participant_id=?')
      .run(owner.participantId);
    expect((await call(db, 'view', auth(owner))).status).toBe(403);
    sqlite.close();
  });

  it('rechecks membership inside the atomic write after concurrent revocation', async () => {
    const { db, sqlite } = setup();
    const owner = await create(db);
    const revoked: RoomDatabase = {
      prepare: db.prepare,
      async batch(statements) {
        sqlite
          .prepare('DELETE FROM site_room_members WHERE participant_id=?')
          .run(owner.participantId);
        return db.batch!(statements);
      },
    };
    expect(
      (await call(revoked, 'edit', edit(owner, 'revoked', 0, 2))).status,
    ).toBe(403);
    expect(
      sqlite.prepare('SELECT revision FROM site_rooms').get(),
    ).toMatchObject({ revision: 0 });
    expect(
      sqlite.prepare('SELECT * FROM site_room_receipts').all(),
    ).toHaveLength(0);
    expect(
      sqlite.prepare('SELECT * FROM site_room_history').all(),
    ).toHaveLength(0);
    sqlite.close();
  });

  it('returns bounded protocol errors and cancels oversized streamed input', async () => {
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
    expect(
      (
        await handleRoomRequest(
          new Request('https://site.test/api/rooms/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: stream,
            duplex: 'half',
          } as RequestInit),
          db,
        )
      ).status,
    ).toBe(413);
    expect(cancelled).toBe(true);
    for (const [body, code] of [
      ['{', 'invalid-json'],
      ['[]', 'invalid-input'],
      ['null', 'invalid-input'],
    ] as const) {
      const result = await handleRoomRequest(
        new Request('https://site.test/api/rooms/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }),
        db,
      );
      expect(await result.json()).toEqual({ error: { code } });
    }
    expect(
      (
        await call(db, 'create', {}, undefined, {
          'Content-Type': 'text/plain',
        })
      ).status,
    ).toBe(415);
    expect((await call(db, 'unknown', {})).status).toBe(404);
    expect(
      (
        await handleRoomRequest(
          new Request('https://site.test/api/rooms/view'),
          db,
        )
      ).status,
    ).toBe(405);
    sqlite.close();
  });
});
