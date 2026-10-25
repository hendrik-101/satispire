import type { Page, WebSocketRoute } from '@playwright/test';
import {
  initialSharedPlan,
  diffPlan,
  reversePlan,
  type SharedPlan,
} from '../../src/domain/shared-plan';
import type { HistoryEntry } from '../../src/room-api';

// Controlled external transport for the real Convex browser client. Backend
// authorization/transactions are exercised separately via registered convex-test functions.
interface Query {
  queryId: number;
  udfPath: string;
  args: Record<string, unknown>[];
}
interface Wire {
  socket: WebSocketRoute;
  queries: Map<number, Query>;
  version: { querySet: number; ts: string; identity: number };
}
export function roomWireFixture() {
  const roomId = '172be3fe-e426-46c2-84f4-765639fcebee',
    shareSecret = 'a'.repeat(64);
  let plan = initialSharedPlan(),
    revision = 0,
    clock = 0,
    members = 0;
  const entries: HistoryEntry[] = [],
    wires = new Set<Wire>();
  const timestamp = () => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(clock));
    return b.toString('base64');
  };
  function result(query: Query) {
    if (query.udfPath === 'plans:view') return { plan, revision };
    if (query.udfPath === 'plans:history') {
      const opts = query.args[0]!.paginationOpts as {
        numItems: number;
        cursor: string | null;
      };
      const start = Number(opts.cursor ?? 0);
      return {
        page: entries.slice(start, start + opts.numItems),
        isDone: start + opts.numItems >= entries.length,
        continueCursor: String(start + opts.numItems),
      };
    }
    throw Error('Unexpected query ' + query.udfPath);
  }
  function transition(wire: Wire, querySet = wire.version.querySet) {
    const next = { ...wire.version, querySet, ts: timestamp() };
    wire.socket.send(
      JSON.stringify({
        type: 'Transition',
        startVersion: wire.version,
        endVersion: next,
        modifications: [...wire.queries.values()].map((q) => ({
          type: 'QueryUpdated',
          queryId: q.queryId,
          value: result(q),
          logLines: [],
          journal: null,
        })),
      }),
    );
    wire.version = next;
  }
  return {
    roomId,
    shareSecret,
    async install(page: Page) {
      await page.route('**/config.json', (route) =>
        route.fulfill({ json: { convexUrl: 'https://test.convex.cloud' } }),
      );
      await page.routeWebSocket('wss://test.convex.cloud/**', (socket) => {
        const wire: Wire = {
          socket,
          queries: new Map(),
          version: {
            querySet: 0,
            ts: Buffer.alloc(8).toString('base64'),
            identity: 0,
          },
        };
        wires.add(wire);
        socket.onClose(() => wires.delete(wire));
        socket.onMessage((raw) => {
          const message = JSON.parse(String(raw)) as {
            type: string;
            udfPath: string;
            requestId: number;
            newVersion: number;
            modifications: (Query & { type: string })[];
            args: Record<string, unknown>[];
          };
          if (message.type === 'ModifyQuerySet') {
            for (const change of message.modifications) {
              if (change.type === 'Add')
                wire.queries.set(change.queryId, change);
              else wire.queries.delete(change.queryId);
            }
            transition(wire, message.newVersion);
          }
          if (message.type === 'Action') {
            const args = message.args[0]!;
            if (message.udfPath === 'plans:create')
              plan = args.plan as SharedPlan;
            const member = {
              roomId,
              participantId: 'member-' + ++members,
              capability: (members === 1 ? 'b' : 'c').repeat(64),
            };
            socket.send(
              JSON.stringify({
                type: 'ActionResponse',
                requestId: message.requestId,
                success: true,
                result:
                  message.udfPath === 'plans:create'
                    ? { ...member, shareSecret }
                    : member,
                logLines: [],
              }),
            );
          }
          if (message.type === 'Mutation') {
            const args = message.args[0]!;
            try {
              if (args.expectedRevision !== revision)
                throw Error('revision-conflict');
              const next =
                message.udfPath === 'plans:undo'
                  ? reversePlan(
                      plan,
                      entries.find((e) => e.id === args.entryId)!.changes,
                    )
                  : (args.plan as SharedPlan);
              const changes = diffPlan(plan, next);
              revision++;
              clock++;
              entries.unshift({
                id: 'entry-' + revision,
                revision,
                participantId: 'member',
                author: 'Mitspieler',
                timestamp: Date.now(),
                summary:
                  message.udfPath === 'plans:undo'
                    ? 'Rückgängig: Outputs'
                    : 'Outputs',
                changes,
                undoOf: typeof args.entryId === 'string' ? args.entryId : null,
              });
              plan = next;
              socket.send(
                JSON.stringify({
                  type: 'MutationResponse',
                  requestId: message.requestId,
                  success: true,
                  result: { revision, duplicate: false },
                  ts: timestamp(),
                  logLines: [],
                }),
              );
              for (const w of wires) transition(w);
            } catch (error) {
              socket.send(
                JSON.stringify({
                  type: 'MutationResponse',
                  requestId: message.requestId,
                  success: false,
                  result: (error as Error).message,
                  logLines: [],
                }),
              );
            }
          }
        });
      });
    },
    remoteEdit(next: SharedPlan) {
      plan = next;
      revision++;
      clock++;
      for (const w of wires) transition(w);
    },
    state: () => structuredClone({ plan, revision, entries, members }),
  };
}
