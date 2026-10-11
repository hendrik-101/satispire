import { isCatalogId } from './catalog.js';
import { Rational } from './rational.js';

/** Server adapters construct this context after verifying a capability. Never accept it from tools. */
export interface RoomContext {
  roomId: string;
  participantId: string;
}
export type RoomRole = 'owner' | 'editor' | 'viewer';
export type RoomViewName = 'production' | 'layout';
export interface Cursor {
  x: number;
  y: number;
}
export interface PresenceInput {
  view: RoomViewName;
  floor: number;
  cursor: Cursor | null;
}
export interface Presence extends PresenceInput {
  following: boolean;
  previous: { view: RoomViewName; floor: number } | null;
}
export interface Participant {
  id: string;
  name: string;
  role: RoomRole;
  color: string;
  presence: Presence;
}
export interface PlannerIntent {
  targets: Record<string, string>;
  blockRows: Record<string, number>;
}
export type RoomCommand =
  | { type: 'set-target'; itemId: string; rate: string }
  | { type: 'set-block-rows'; blockId: string; rows: number };
export interface RoomCommandEnvelope {
  id: string;
  expectedRevision: number;
  command: RoomCommand;
}
export interface Invite {
  id: string;
  digest: string;
  role: 'editor' | 'viewer';
  used: boolean;
  revoked: boolean;
}
export interface Receipt {
  participantId: string;
  fingerprint: string;
  revision: number;
}
export interface RoomState {
  id: string;
  revision: number;
  intent: PlannerIntent;
  participants: Record<string, Participant>;
  invites: Record<string, Invite>;
  receipts: Record<string, Receipt>;
  presenterId: string | null;
}
export type PublicRoom = Omit<RoomState, 'invites' | 'receipts'>;
export type RoomErrorCode =
  | 'forbidden'
  | 'invalid-command'
  | 'revision-conflict'
  | 'command-id-reused'
  | 'invalid-invite'
  | 'invalid-participant'
  | 'invalid-presence';
export class RoomError extends Error {
  constructor(public readonly code: RoomErrorCode) {
    super(code);
    this.name = 'RoomError';
  }
}
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function fail(code: RoomErrorCode): never {
  throw new RoomError(code);
}
const colors = [
  '#d95f02',
  '#1b9e77',
  '#7570b3',
  '#e7298a',
  '#66a61e',
  '#e6ab02',
  '#a6761d',
  '#1f78b4',
];
function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) &&
    !['__proto__', 'constructor', 'prototype'].includes(value)
  );
}
function participant(
  id: string,
  name: string,
  role: RoomRole,
  index: number,
): Participant {
  if (
    !validId(id) ||
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 80
  )
    fail('invalid-participant');
  return {
    id,
    name: name.trim(),
    role,
    color: colors[index % colors.length]!,
    presence: {
      view: 'production',
      floor: 0,
      cursor: null,
      following: false,
      previous: null,
    },
  };
}
export function createRoom(input: {
  roomId: string;
  ownerId: string;
  ownerName: string;
}): RoomState {
  if (!validId(input.roomId)) fail('invalid-participant');
  const p = participant(input.ownerId, input.ownerName, 'owner', 0);
  return {
    id: input.roomId,
    revision: 0,
    intent: { targets: {}, blockRows: {} },
    participants: { [p.id]: p },
    invites: {},
    receipts: {},
    presenterId: null,
  };
}
export function authorizeRoom(
  room: RoomState,
  context: RoomContext,
  permission: 'read' | 'edit' | 'owner' = 'read',
): Participant {
  if (
    context.roomId !== room.id ||
    !validId(context.participantId) ||
    !Object.hasOwn(room.participants, context.participantId)
  )
    fail('forbidden');
  const p = room.participants[context.participantId]!;
  if (
    (permission === 'owner' && p.role !== 'owner') ||
    (permission === 'edit' && p.role === 'viewer')
  )
    fail('forbidden');
  return p;
}
export function roomView(room: RoomState, context: RoomContext): PublicRoom {
  const viewer = authorizeRoom(room, context);
  const result = cloneJson({
    id: room.id,
    revision: room.revision,
    intent: room.intent,
    participants: room.participants,
    presenterId: room.presenterId,
  });
  for (const p of Object.values(result.participants)) {
    if (
      p.presence.view !== viewer.presence.view ||
      p.presence.floor !== viewer.presence.floor
    )
      p.presence.cursor = null;
  }
  return result;
}
export const readRoom = roomView;
export function createInvite(
  room: RoomState,
  context: RoomContext,
  input: { id: string; digest: string; role: 'editor' | 'viewer' },
): RoomState {
  authorizeRoom(room, context, 'owner');
  if (
    !validId(input.id) ||
    typeof input.digest !== 'string' ||
    !input.digest ||
    input.digest.length > 256 ||
    !['editor', 'viewer'].includes(input.role) ||
    Object.hasOwn(room.invites, input.id) ||
    Object.values(room.invites).some((i) => i.digest === input.digest)
  )
    fail('invalid-invite');
  return {
    ...room,
    invites: {
      ...room.invites,
      [input.id]: { ...input, used: false, revoked: false },
    },
  };
}
export function revokeInvite(
  room: RoomState,
  context: RoomContext,
  inviteId: string,
): RoomState {
  authorizeRoom(room, context, 'owner');
  const invite = Object.hasOwn(room.invites, inviteId)
    ? room.invites[inviteId]
    : undefined;
  if (!invite) fail('invalid-invite');
  return {
    ...room,
    invites: { ...room.invites, [inviteId]: { ...invite, revoked: true } },
  };
}
/** participant ID is generated by the server, role comes only from a verified invitation digest. */
export function joinRoom(
  room: RoomState,
  digest: string,
  input: { id: string; name: string },
): RoomState {
  const invite = Object.values(room.invites).find(
    (i) => i.digest === digest && !i.used && !i.revoked,
  );
  if (!invite) fail('invalid-invite');
  if (Object.hasOwn(room.participants, input.id)) fail('invalid-participant');
  const count = Object.keys(room.participants).length;
  const p = participant(input.id, input.name, invite.role, count);
  return {
    ...room,
    participants: { ...room.participants, [p.id]: p },
    invites: { ...room.invites, [invite.id]: { ...invite, used: true } },
  };
}
function exactKeys(value: object, keys: string[]): boolean {
  const found = Object.keys(value).sort();
  return JSON.stringify(found) === JSON.stringify(keys.sort());
}
function validRate(rate: unknown): rate is string {
  if (typeof rate !== 'string') return false;
  try {
    return Rational.parse(rate).compare(Rational.parse('0')) > 0;
  } catch {
    return false;
  }
}

function fingerprint(envelope: RoomCommandEnvelope): string {
  const c = envelope.command;
  if (
    !validId(envelope.id) ||
    !Number.isSafeInteger(envelope.expectedRevision) ||
    envelope.expectedRevision < 0 ||
    !c ||
    typeof c !== 'object'
  )
    fail('invalid-command');
  if (
    c.type === 'set-target' &&
    exactKeys(c, ['type', 'itemId', 'rate']) &&
    isCatalogId(c.itemId) &&
    !['__proto__', 'constructor', 'prototype'].includes(c.itemId) &&
    validRate(c.rate)
  ) {
    return JSON.stringify([
      envelope.expectedRevision,
      c.type,
      c.itemId,
      c.rate,
    ]);
  }
  if (
    c.type === 'set-block-rows' &&
    exactKeys(c, ['type', 'blockId', 'rows']) &&
    validId(c.blockId) &&
    Number.isInteger(c.rows) &&
    c.rows >= 1 &&
    c.rows <= 256
  ) {
    return JSON.stringify([
      envelope.expectedRevision,
      c.type,
      c.blockId,
      c.rows,
    ]);
  }
  return fail('invalid-command');
}
export function applyRoomCommand(
  room: RoomState,
  context: RoomContext,
  envelope: RoomCommandEnvelope,
): { room: RoomState; revision: number; duplicate: boolean } {
  authorizeRoom(room, context, 'edit');
  const signature = fingerprint(envelope);
  const receipt = Object.hasOwn(room.receipts, envelope.id)
    ? room.receipts[envelope.id]
    : undefined;
  if (receipt) {
    if (
      receipt.participantId !== context.participantId ||
      receipt.fingerprint !== signature
    )
      fail('command-id-reused');
    return { room, revision: receipt.revision, duplicate: true };
  }
  if (envelope.expectedRevision !== room.revision) fail('revision-conflict');
  if (!Number.isSafeInteger(room.revision + 1)) fail('invalid-command');
  const c = envelope.command;
  const intent: PlannerIntent =
    c.type === 'set-target'
      ? {
          ...room.intent,
          targets: {
            ...room.intent.targets,
            [c.itemId]: Rational.parse(c.rate).toString(),
          },
        }
      : {
          ...room.intent,
          blockRows: { ...room.intent.blockRows, [c.blockId]: c.rows },
        };
  const revision = room.revision + 1;
  return {
    room: {
      ...room,
      intent,
      revision,
      receipts: {
        ...room.receipts,
        [envelope.id]: {
          participantId: context.participantId,
          fingerprint: signature,
          revision,
        },
      },
    },
    revision,
    duplicate: false,
  };
}
function validPresence(input: PresenceInput): boolean {
  return (
    ['production', 'layout'].includes(input.view) &&
    Number.isInteger(input.floor) &&
    input.floor >= 0 &&
    input.floor <= 255 &&
    (input.cursor === null ||
      (typeof input.cursor === 'object' &&
        Number.isFinite(input.cursor.x) &&
        Number.isFinite(input.cursor.y)))
  );
}
function replaceParticipant(room: RoomState, p: Participant): RoomState {
  return { ...room, participants: { ...room.participants, [p.id]: p } };
}
export function setPresence(
  room: RoomState,
  context: RoomContext,
  input: PresenceInput,
): RoomState {
  const p = authorizeRoom(room, context);
  if (!validPresence(input)) fail('invalid-presence');
  // Explicit navigation is the keyboard/escape-equivalent cancellation of following.
  let next = replaceParticipant(room, {
    ...p,
    presence: { ...cloneJson(input), following: false, previous: null },
  });
  if (room.presenterId === p.id) {
    for (const follower of Object.values(next.participants)) {
      if (follower.presence.following)
        next = replaceParticipant(next, {
          ...follower,
          presence: {
            ...follower.presence,
            view: input.view,
            floor: input.floor,
            cursor: null,
          },
        });
    }
  }
  return next;
}
export function presenceFor(
  room: RoomState,
  context: RoomContext,
): { participantId: string; name: string; color: string; cursor: Cursor }[] {
  const viewer = authorizeRoom(room, context);
  return Object.values(room.participants)
    .filter(
      (p) =>
        p.id !== viewer.id &&
        p.presence.view === viewer.presence.view &&
        p.presence.floor === viewer.presence.floor &&
        p.presence.cursor !== null,
    )
    .map((p) => ({
      participantId: p.id,
      name: p.name,
      color: p.color,
      cursor: { ...p.presence.cursor! },
    }));
}
export function followPresenter(
  room: RoomState,
  context: RoomContext,
  enabled: boolean,
): RoomState {
  const p = authorizeRoom(room, context);
  if (!enabled) {
    const previous = p.presence.previous;
    return replaceParticipant(room, {
      ...p,
      presence: {
        ...p.presence,
        ...(previous ?? {}),
        cursor: null,
        following: false,
        previous: null,
      },
    });
  }
  const presenter = room.presenterId
    ? room.participants[room.presenterId]
    : undefined;
  if (!presenter || presenter.id === p.id) fail('invalid-presence');
  return replaceParticipant(room, {
    ...p,
    presence: {
      view: presenter.presence.view,
      floor: presenter.presence.floor,
      cursor: null,
      following: true,
      previous: p.presence.previous ?? {
        view: p.presence.view,
        floor: p.presence.floor,
      },
    },
  });
}
export function setPresenter(
  room: RoomState,
  context: RoomContext,
  enabled: boolean,
): RoomState {
  const p = authorizeRoom(room, context, 'edit');
  if (!enabled && room.presenterId !== p.id) fail('forbidden');
  let next = room;
  // A new presenter never silently inherits the previous presenter's followers.
  for (const follower of Object.values(room.participants)) {
    if (follower.presence.following)
      next = followPresenter(
        next,
        { roomId: room.id, participantId: follower.id },
        false,
      );
  }
  return { ...next, presenterId: enabled ? p.id : null };
}
