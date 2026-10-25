import { makeFunctionReference } from 'convex/server';
import type { SharedPlan, PlanChange } from './domain/shared-plan.js';
export interface Membership {
  roomId: string;
  participantId: string;
  capability: string;
}
export type RoomAuth = Pick<Membership, 'roomId' | 'capability'>;
export interface RoomPlan {
  plan: SharedPlan;
  revision: number;
}
export interface HistoryEntry {
  id: string;
  revision: number;
  participantId: string;
  author: string;
  timestamp: number;
  summary: string;
  changes: PlanChange[];
  undoOf: string | null;
}
export interface HistoryPage {
  page: HistoryEntry[];
  isDone: boolean;
  continueCursor: string;
}
export const roomApi = {
  create: makeFunctionReference<
    'action',
    { name: string; plan: SharedPlan },
    Membership & { shareSecret: string }
  >('plans:create'),
  join: makeFunctionReference<
    'action',
    { roomId: string; shareSecret: string; name: string },
    Membership
  >('plans:join'),
  view: makeFunctionReference<'query', RoomAuth, RoomPlan>('plans:view'),
  edit: makeFunctionReference<
    'mutation',
    RoomAuth & { id: string; expectedRevision: number; plan: SharedPlan },
    { revision: number; duplicate: boolean }
  >('plans:edit'),
  undo: makeFunctionReference<
    'mutation',
    RoomAuth & { id: string; expectedRevision: number; entryId: string },
    { revision: number; duplicate: boolean }
  >('plans:undo'),
  history: makeFunctionReference<
    'query',
    RoomAuth & { paginationOpts: { numItems: number; cursor: string | null } },
    HistoryPage
  >('plans:history'),
};
