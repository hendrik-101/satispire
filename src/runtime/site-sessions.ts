import { validateSessionPlan } from '../session-plan.js';
/** Structural subset of the native D1 binding; no connection or runtime DDL. */
export interface SessionDatabase {
  prepare(sql: string): SessionStatement;
}
export interface SessionStatement {
  bind(...values: (string | number | null)[]): SessionStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
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
const random = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
const digest = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
function string(a: Record<string, unknown>, key: string, max = 128) {
  const s = a[key];
  if (typeof s !== 'string' || !s || s.length > max) fail(400, 'invalid-input');
  return s as string;
}
function token(a: Record<string, unknown>, key: string) {
  const s = string(a, key, 64);
  if (!/^[a-f0-9]{64}$/.test(s)) fail(403, 'forbidden');
  return s;
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
async function body(request: Request) {
  if (
    !/^application\/json(?:;|$)/i.test(
      request.headers.get('content-type') ?? '',
    )
  )
    fail(415, 'json-required');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'invalid-json');
  let size = 0;
  const decoder = new TextDecoder();
  let text = '';
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
interface Member {
  session_id: string;
  participant_id: string;
  name: string;
  color: string;
}
interface Stored {
  revision: number;
  plan_json: string;
  receipts_json: string;
}
interface Receipt {
  id: string;
  participantId: string;
  fingerprint: string;
  revision: number;
}
async function authorized(db: SessionDatabase, a: Record<string, unknown>) {
  const sessionId = token(a, 'sessionId');
  const capability = token(a, 'capability');
  const m = await db
    .prepare(
      'SELECT session_id,participant_id,name,color FROM site_session_members WHERE digest=? AND session_id=?',
    )
    .bind(await digest(capability), sessionId)
    .first<Member>();
  if (!m) fail(403, 'forbidden');
  return m!;
}
async function stored(db: SessionDatabase, id: string) {
  const s = await db
    .prepare(
      'SELECT revision,plan_json,receipts_json FROM site_sessions WHERE session_id=?',
    )
    .bind(id)
    .first<Stored>();
  if (!s) fail(403, 'forbidden');
  return s!;
}
function plan(value: unknown) {
  try {
    return validateSessionPlan(value);
  } catch {
    fail(400, 'invalid-plan');
  }
}
function location(a: Record<string, unknown>) {
  const view = string(a, 'view');
  if (view !== 'production' && view !== 'layout') fail(400, 'invalid-presence');
  const floor = string(a, 'floor', 256);
  return { view, floor };
}
function retry(
  s: Stored,
  id: string,
  participantId: string,
  fingerprint: string,
) {
  const receipts = JSON.parse(s.receipts_json) as Receipt[];
  const r = receipts.find((r) => r.id === id);
  if (r) {
    if (r.participantId !== participantId || r.fingerprint !== fingerprint)
      fail(409, 'command-id-reused');
    return { revision: r.revision, duplicate: true };
  }
  return null;
}
/** POST JSON at /api/sessions/{create,join,read,commit,presence,peers}. */
export async function handleSessionRequest(
  request: Request,
  db: SessionDatabase,
): Promise<Response> {
  try {
    if (request.method !== 'POST')
      return response({ error: { code: 'method-not-allowed' } }, 405);
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    if (
      (origin && origin !== url.origin) ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      fail(403, 'forbidden');
    const operation = url.pathname.match(
      /^\/api\/sessions\/(create|join|read|commit|presence|peers)$/,
    )?.[1];
    if (!operation) fail(404, 'not-found');
    const a = await body(request);
    if (operation === 'create' || operation === 'join') {
      const name = string(a, 'name', 80).trim();
      if (!name) fail(400, 'invalid-participant');
      const sessionId =
        operation === 'create' ? random() : token(a, 'sessionId');
      if (operation === 'create')
        await db
          .prepare(
            'INSERT INTO site_sessions(session_id,plan_json) VALUES (?,?)',
          )
          .bind(sessionId, JSON.stringify(plan(a.plan)))
          .run();
      const capability = random();
      const participantId = crypto.randomUUID();
      const inserted = await db
        .prepare(
          `INSERT INTO site_session_members(digest,session_id,participant_id,name,color) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM site_sessions WHERE session_id=?) AND (SELECT COUNT(*) FROM site_session_members WHERE session_id=?)<128`,
        )
        .bind(
          await digest(capability),
          sessionId,
          participantId,
          name,
          ['#f39a45', '#60bfa3', '#8e9ff1', '#e69bc5'][
            parseInt(participantId.slice(-1), 16) % 4
          ]!,
          sessionId,
          sessionId,
        )
        .run();
      if (!inserted.meta.changes) fail(403, 'session-unavailable');
      return response({ sessionId, participantId, capability });
    }
    const member = await authorized(db, a);
    const sessionId = member.session_id;
    if (operation === 'read') {
      const s = await stored(db, sessionId);
      return response({ revision: s.revision, plan: JSON.parse(s.plan_json) });
    }
    if (operation === 'commit') {
      const id = string(a, 'id');
      if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) fail(400, 'invalid-command');
      const expected = a.expectedRevision;
      if (
        typeof expected !== 'number' ||
        !Number.isSafeInteger(expected) ||
        expected < 0 ||
        expected >= Number.MAX_SAFE_INTEGER
      )
        fail(400, 'invalid-command');
      const p = plan(a.plan);
      const fingerprint = await digest(JSON.stringify([expected, p]));
      const s = await stored(db, sessionId);
      const duplicate = retry(s, id, member.participant_id, fingerprint);
      if (duplicate) return response(duplicate);
      if (s.revision !== expected) fail(409, 'revision-conflict');
      const revision = expected + 1;
      const receipts = [
        ...(JSON.parse(s.receipts_json) as Receipt[]),
        { id, participantId: member.participant_id, fingerprint, revision },
      ].slice(-128);
      const result = await db
        .prepare(
          'UPDATE site_sessions SET plan_json=?,receipts_json=?,revision=? WHERE session_id=? AND revision=?',
        )
        .bind(
          JSON.stringify(p),
          JSON.stringify(receipts),
          revision,
          sessionId,
          expected,
        )
        .run();
      if (!result.meta.changes) {
        const duplicate = retry(
          await stored(db, sessionId),
          id,
          member.participant_id,
          fingerprint,
        );
        if (duplicate) return response(duplicate);
        fail(409, 'revision-conflict');
      }
      return response({ revision, duplicate: false });
    }
    const { view, floor } = location(a);
    const now = Date.now();
    await db
      .prepare(
        'DELETE FROM site_session_presence WHERE session_id=? AND updated_at<=?',
      )
      .bind(sessionId, now - 15000)
      .run();
    if (operation === 'presence') {
      const clientId = string(a, 'clientId');
      if (!/^[A-Za-z0-9._:-]{1,128}$/.test(clientId))
        fail(400, 'invalid-presence');
      const cursor = a.cursor;
      if (
        cursor !== null &&
        (typeof cursor !== 'object' ||
          !cursor ||
          !('x' in cursor) ||
          !('y' in cursor) ||
          typeof cursor.x !== 'number' ||
          typeof cursor.y !== 'number' ||
          !Number.isFinite(cursor.x) ||
          !Number.isFinite(cursor.y))
      )
        fail(400, 'invalid-presence');
      const result = await db
        .prepare(
          `INSERT INTO site_session_presence(session_id,participant_id,client_id,name,color,view,floor,cursor_json,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM site_session_presence WHERE session_id=? AND participant_id=?)<8 OR EXISTS(SELECT 1 FROM site_session_presence WHERE session_id=? AND participant_id=? AND client_id=?) ON CONFLICT(session_id,participant_id,client_id) DO UPDATE SET view=excluded.view,floor=excluded.floor,cursor_json=excluded.cursor_json,updated_at=excluded.updated_at`,
        )
        .bind(
          sessionId,
          member.participant_id,
          clientId,
          member.name,
          member.color,
          view,
          floor,
          cursor === null
            ? null
            : JSON.stringify({
                x: (cursor as { x: number }).x,
                y: (cursor as { y: number }).y,
              }),
          now,
          sessionId,
          member.participant_id,
          sessionId,
          member.participant_id,
          clientId,
        )
        .run();
      if (!result.meta.changes) fail(409, 'too-many-clients');
      return response(null);
    }
    const rows = await db
      .prepare(
        'SELECT participant_id,client_id,name,color,view,floor,cursor_json,updated_at FROM site_session_presence WHERE session_id=? AND view=? AND floor=? AND updated_at>? AND participant_id<>? AND cursor_json IS NOT NULL',
      )
      .bind(sessionId, view, floor, now - 15000, member.participant_id)
      .all<{
        participant_id: string;
        client_id: string;
        name: string;
        color: string;
        view: string;
        floor: string;
        cursor_json: string;
        updated_at: number;
      }>();
    return response(
      rows.results.map((p) => ({
        participantId: p.participant_id,
        clientId: p.client_id,
        name: p.name,
        color: p.color,
        view: p.view,
        floor: p.floor,
        cursor: JSON.parse(p.cursor_json),
        updatedAt: p.updated_at,
      })),
    );
  } catch (e) {
    return e instanceof HttpError
      ? response({ error: { code: e.code } }, e.status)
      : response({ error: { code: 'internal-error' } }, 500);
  }
}
