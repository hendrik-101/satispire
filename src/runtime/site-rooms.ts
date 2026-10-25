import {
  canonical,
  diffPlan,
  reversePlan,
  validateSharedPlan,
  type PlanChange,
  type SharedPlan,
} from '../domain/shared-plan.js';
import type { HistoryEntry } from '../room-api.js';
import type { SessionDatabase, SessionStatement } from './site-sessions.js';

/** Native D1 batch executes its statements sequentially in one transaction. */
export interface RoomDatabase extends SessionDatabase {
  batch?(
    statements: SessionStatement[],
  ): Promise<{ meta: { changes: number } }[]>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
function fail(status: number, code: string): never {
  throw new HttpError(status, code);
}
const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
const random = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
function string(a: Record<string, unknown>, key: string, max = 128) {
  const value = a[key];
  if (typeof value !== 'string' || !value || value.length > max)
    fail(400, 'invalid-input');
  return value;
}
function roomId(a: Record<string, unknown>) {
  const value = a.roomId;
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      value,
    )
  )
    fail(403, 'forbidden');
  return value;
}
function token(a: Record<string, unknown>, key: string) {
  const value = a[key];
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    fail(403, 'forbidden');
  return value;
}
function participant(a: Record<string, unknown>) {
  const value = typeof a.name === 'string' ? a.name.trim() : '';
  if (!value || value.length > 80) fail(400, 'invalid-participant');
  return value;
}
function plan(raw: unknown) {
  if (bytes(JSON.stringify(raw) ?? '') > 180000) fail(413, 'plan-too-large');
  try {
    return validateSharedPlan(raw);
  } catch {
    fail(400, 'invalid-plan');
  }
}
async function body(request: Request) {
  if (
    !/^application\/json(?:;|$)/i.test(
      request.headers.get('content-type') ?? '',
    )
  )
    fail(415, 'json-required');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'invalid-json');
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 307200) {
        await reader.cancel();
        fail(413, 'body-too-large');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail(400, 'invalid-json');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(400, 'invalid-input');
  return value as Record<string, unknown>;
}
function transactional(db: RoomDatabase) {
  if (!db.batch) fail(503, 'storage-unavailable');
  return (statements: SessionStatement[]) => db.batch!(statements);
}
interface Member {
  digest: string;
  room_id: string;
  participant_id: string;
  name: string;
  role: string;
}
interface Stored {
  revision: number;
  plan_json: string;
}
interface Receipt {
  participant_id: string;
  fingerprint: string;
  revision: number;
}
interface HistoryRow {
  id: string;
  revision: number;
  participant_id: string;
  author: string;
  timestamp: number;
  summary: string;
  changes_json: string;
  undo_of: string | null;
}
async function authorized(db: RoomDatabase, a: Record<string, unknown>) {
  const id = roomId(a);
  const member = await db
    .prepare(
      'SELECT digest,room_id,participant_id,name,role FROM site_room_members WHERE digest=? AND room_id=?',
    )
    .bind(await digest(token(a, 'capability')), id)
    .first<Member>();
  if (!member) fail(403, 'forbidden');
  return member;
}
async function stored(db: RoomDatabase, id: string) {
  const result = await db
    .prepare('SELECT revision,plan_json FROM site_rooms WHERE room_id=?')
    .bind(id)
    .first<Stored>();
  if (!result) fail(403, 'forbidden');
  return result;
}
async function retry(
  db: RoomDatabase,
  member: Member,
  id: string,
  fingerprint: string,
) {
  const receipt = await db
    .prepare(
      'SELECT participant_id,fingerprint,revision FROM site_room_receipts WHERE room_id=? AND command_id=?',
    )
    .bind(member.room_id, id)
    .first<Receipt>();
  if (!receipt) return null;
  if (
    receipt.participant_id !== member.participant_id ||
    receipt.fingerprint !== fingerprint
  )
    fail(409, 'command-id-reused');
  return { revision: receipt.revision, duplicate: true };
}
const fieldNames: Record<PlanChange['field'], string> = {
  targets: 'Outputs',
  recipes: 'Rezepte',
  imports: 'Inputs',
  unlocks: 'Freischaltungen',
  rows: 'Reihen',
  variant: 'Layout',
};

async function admit(db: RoomDatabase, actorKey: string | undefined) {
  if (!actorKey || actorKey.length > 200) fail(503, 'caller-unavailable');
  const batch = transactional(db);
  const actor = await digest(actorKey);
  const now = Date.now();
  const results = await batch([
    db
      .prepare('DELETE FROM site_room_caller_admission WHERE window_start<=?')
      .bind(now - 300000),
    db
      .prepare(
        'INSERT OR IGNORE INTO site_room_caller_admission(actor_key,window_start,attempts) VALUES (?,?,0)',
      )
      .bind(actor, now),
    db
      .prepare(
        'UPDATE site_room_caller_admission SET attempts=CASE WHEN window_start<=? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<=? THEN ? ELSE window_start END WHERE actor_key=? AND (window_start<=? OR attempts<5)',
      )
      .bind(now - 60000, now - 60000, now, actor, now - 60000),
  ]);
  if (!results[2]?.meta.changes) fail(429, 'rate-limited');
}

async function commit(
  db: RoomDatabase,
  a: Record<string, unknown>,
  member: Member,
  undo: boolean,
) {
  const batch = transactional(db);
  if (member.role !== 'owner' && member.role !== 'editor')
    fail(403, 'forbidden');
  const id = string(a, 'id');
  const expected = a.expectedRevision;
  if (
    !/^[A-Za-z0-9._:-]{1,128}$/.test(id) ||
    typeof expected !== 'number' ||
    !Number.isSafeInteger(expected) ||
    expected < 0 ||
    expected >= Number.MAX_SAFE_INTEGER
  )
    fail(400, 'invalid-command');
  const entryId = undo ? string(a, 'entryId') : null;
  const raw = canonical({
    expectedRevision: expected,
    ...(undo ? { entryId } : { plan: a.plan }),
  });
  if (bytes(raw) > 200000) fail(413, 'plan-too-large');
  const fingerprint = await digest(raw);
  const duplicate = await retry(db, member, id, fingerprint);
  if (duplicate) return duplicate;
  const before = await stored(db, member.room_id);
  if (before.revision !== expected) {
    const duplicate = await retry(db, member, id, fingerprint);
    if (duplicate) return duplicate;
    fail(409, 'revision-conflict');
  }
  let next: SharedPlan;
  if (entryId) {
    const entry = await db
      .prepare(
        'SELECT changes_json FROM site_room_history WHERE room_id=? AND id=?',
      )
      .bind(member.room_id, entryId)
      .first<{ changes_json: string }>();
    if (!entry) fail(403, 'forbidden');
    try {
      next = reversePlan(
        JSON.parse(before.plan_json) as SharedPlan,
        JSON.parse(entry.changes_json) as PlanChange[],
      );
    } catch {
      fail(409, 'undo-conflict');
    }
    next = plan(next);
  } else next = plan(a.plan);
  const changes = diffPlan(JSON.parse(before.plan_json) as SharedPlan, next);
  const revision = expected + (changes.length ? 1 : 0);
  const ticket = crypto.randomUUID();
  // Only the CAS winner installs this unguessable marker. All dependent writes
  // select that marker inside the same native D1 transaction, so a losing CAS
  // cannot append history or a receipt (even for a no-op revision).
  const statements = [
    db
      .prepare(
        "UPDATE site_rooms SET revision=?,plan_json=?,write_token=? WHERE room_id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM site_room_receipts WHERE room_id=? AND command_id=?) AND EXISTS(SELECT 1 FROM site_room_members WHERE digest=? AND room_id=? AND participant_id=? AND role IN ('owner','editor'))",
      )
      .bind(
        revision,
        JSON.stringify(next),
        ticket,
        member.room_id,
        expected,
        member.room_id,
        id,
        member.digest,
        member.room_id,
        member.participant_id,
      ),
  ];
  if (changes.length)
    statements.push(
      db
        .prepare(
          'INSERT INTO site_room_history(id,room_id,revision,participant_id,author,timestamp,summary,changes_json,undo_of) SELECT ?,?,?,?,?,?,?,?,? FROM site_rooms WHERE room_id=? AND write_token=?',
        )
        .bind(
          crypto.randomUUID(),
          member.room_id,
          revision,
          member.participant_id,
          member.name,
          Date.now(),
          (undo ? 'Rückgängig: ' : '') +
            changes.map((c) => fieldNames[c.field]).join(', '),
          JSON.stringify(changes),
          entryId,
          member.room_id,
          ticket,
        ),
    );
  statements.push(
    db
      .prepare(
        'INSERT INTO site_room_receipts(room_id,command_id,participant_id,fingerprint,revision) SELECT ?,?,?,?,? FROM site_rooms WHERE room_id=? AND write_token=?',
      )
      .bind(
        member.room_id,
        id,
        member.participant_id,
        fingerprint,
        revision,
        member.room_id,
        ticket,
      ),
  );
  const results = await batch(statements);
  if (!results[0]?.meta.changes) {
    const currentMember = await authorized(db, a);
    if (currentMember.role !== 'owner' && currentMember.role !== 'editor')
      fail(403, 'forbidden');
    const duplicate = await retry(db, member, id, fingerprint);
    if (duplicate) return duplicate;
    fail(409, 'revision-conflict');
  }
  return { revision, duplicate: false };
}

async function history(
  db: RoomDatabase,
  member: Member,
  a: Record<string, unknown>,
) {
  const options = a.paginationOpts as {
    numItems?: unknown;
    cursor?: unknown;
  } | null;
  if (
    !options ||
    typeof options !== 'object' ||
    typeof options.numItems !== 'number' ||
    !Number.isInteger(options.numItems) ||
    options.numItems < 1 ||
    options.numItems > 50
  )
    fail(400, 'invalid-page-size');
  let before = Number.MAX_SAFE_INTEGER;
  if (options.cursor !== null) {
    if (typeof options.cursor !== 'string') fail(400, 'invalid-cursor');
    const prefix = member.room_id + ':';
    if (
      !options.cursor.startsWith(prefix) ||
      !/^[1-9][0-9]*$/.test(options.cursor.slice(prefix.length))
    )
      fail(400, 'invalid-cursor');
    before = Number(options.cursor.slice(prefix.length));
    if (!Number.isSafeInteger(before)) fail(400, 'invalid-cursor');
  }
  const rows = (
    await db
      .prepare(
        'SELECT id,revision,participant_id,author,timestamp,summary,changes_json,undo_of FROM site_room_history WHERE room_id=? AND revision<? ORDER BY revision DESC LIMIT ?',
      )
      .bind(member.room_id, before, options.numItems + 1)
      .all<HistoryRow>()
  ).results;
  const isDone = rows.length <= options.numItems;
  const page = rows.slice(0, options.numItems).map(
    (r): HistoryEntry => ({
      id: r.id,
      revision: r.revision,
      participantId: r.participant_id,
      author: r.author,
      timestamp: r.timestamp,
      summary: r.summary,
      changes: JSON.parse(r.changes_json) as PlanChange[],
      undoOf: r.undo_of,
    }),
  );
  return {
    page,
    isDone,
    continueCursor: page.length
      ? member.room_id + ':' + page[page.length - 1]!.revision
      : '',
  };
}

/** POST JSON at /api/rooms/{create,join,view,edit,undo,history}. */
export async function handleRoomRequest(
  request: Request,
  db: RoomDatabase,
  actorKey?: string,
): Promise<Response> {
  try {
    if (request.method !== 'POST') fail(405, 'method-not-allowed');
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    if (
      (origin && origin !== url.origin) ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      fail(403, 'forbidden');
    const operation = url.pathname.match(
      /^\/api\/rooms\/(create|join|view|edit|undo|history)$/,
    )?.[1];
    if (!operation) fail(404, 'not-found');
    const a = await body(request);
    if (operation === 'create') await admit(db, actorKey);
    if (operation === 'create' || operation === 'join') {
      const batch = transactional(db);
      const name = participant(a);
      const id = operation === 'create' ? crypto.randomUUID() : roomId(a);
      const capability = random();
      const participantId = crypto.randomUUID();
      if (operation === 'create') {
        const initial = plan(a.plan);
        const shareSecret = random();
        const results = await batch([
          db
            .prepare(
              'INSERT INTO site_rooms(room_id,plan_json,share_digest) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM site_rooms)<512',
            )
            .bind(id, JSON.stringify(initial), await digest(shareSecret)),
          db
            .prepare(
              "INSERT INTO site_room_members(digest,room_id,participant_id,name,role) SELECT ?,?,?,?,'owner' FROM site_rooms WHERE room_id=?",
            )
            .bind(await digest(capability), id, participantId, name, id),
        ]);
        if (!results[0]?.meta.changes) fail(503, 'room-limit');
        return response({ roomId: id, participantId, capability, shareSecret });
      }
      const results = await batch([
        db
          .prepare(
            "INSERT INTO site_room_members(digest,room_id,participant_id,name,role) SELECT ?,?,?,?,'editor' FROM site_rooms WHERE room_id=? AND share_digest=? AND (SELECT COUNT(*) FROM site_room_members WHERE room_id=?)<128",
          )
          .bind(
            await digest(capability),
            id,
            participantId,
            name,
            id,
            await digest(token(a, 'shareSecret')),
            id,
          ),
      ]);
      if (!results[0]?.meta.changes) fail(403, 'forbidden');
      return response({ roomId: id, participantId, capability });
    }
    const member = await authorized(db, a);
    if (operation === 'view') {
      const state = await stored(db, member.room_id);
      return response({
        revision: state.revision,
        plan: JSON.parse(state.plan_json) as SharedPlan,
      });
    }
    if (operation === 'history') return response(await history(db, member, a));
    return response(await commit(db, a, member, operation === 'undo'));
  } catch (error) {
    return error instanceof HttpError
      ? response({ error: { code: error.code } }, error.status)
      : response({ error: { code: 'internal-error' } }, 500);
  }
}
