import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createRoom } from '../../src/domain/rooms';
import { syntheticCatalog } from '../../src/domain/catalog';
import { createLocalApplication } from '../../src/application';

const browserModule = ts.transpileModule(
  readFileSync('src/adapters/webmcp.ts', 'utf8'),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  },
).outputText;

test('browser without native WebMCP retains a callable application fallback', async ({
  page,
}) => {
  const room = createRoom({
    roomId: 'browser-room',
    ownerId: 'owner',
    ownerName: 'Owner',
  });
  const app = createLocalApplication(
    room,
    { roomId: room.id, participantId: 'owner' },
    syntheticCatalog,
  );
  await page.exposeFunction('applicationCall', app.execute);
  const state = await page.evaluate(async (code) => {
    const adapter = await import('data:text/javascript;base64,' + btoa(code));
    const handle = adapter.registerWebMcp({}, () =>
      Promise.resolve({ ok: true }),
    );
    // A normal UI can invoke this same function independently of registration.
    const call = (
      window as unknown as {
        applicationCall: (name: string, args: unknown) => Promise<unknown>;
      }
    ).applicationCall;
    const result = await call('read_room', { roomId: 'browser-room' });
    return { available: handle.available, result };
  }, browserModule);
  expect(state).toMatchObject({
    available: false,
    result: { ok: true, data: { revision: 0 } },
  });
});

test('early-preview API harness executes versioned edits and forbids cross-room calls', async ({
  page,
}) => {
  const room = createRoom({
    roomId: 'browser-room',
    ownerId: 'owner',
    ownerName: 'Owner',
  });
  const app = createLocalApplication(
    room,
    { roomId: room.id, participantId: 'owner' },
    syntheticCatalog,
  );
  await page.exposeFunction('applicationCall', app.execute);
  const result = await page.evaluate(async (code) => {
    const adapter = await import('data:text/javascript;base64,' + btoa(code));
    const calls = new Map<
      string,
      { execute: (input: unknown) => Promise<unknown> }
    >();
    const call = (
      window as unknown as {
        applicationCall: (name: string, args: unknown) => Promise<unknown>;
      }
    ).applicationCall;
    // This harness emulates the preview API; it does not claim native AI-client support.
    const modelContext = {
      registerTool: (tool: {
        name: string;
        execute: (input: unknown) => Promise<unknown>;
      }) => calls.set(tool.name, tool),
      unregisterTool: (name: string) => calls.delete(name),
    };
    const handle = adapter.registerWebMcp({ modelContext }, call);
    const envelope = {
      id: 'browser-edit',
      expectedRevision: 0,
      command: { type: 'set-block-rows', blockId: 'block-a', rows: 3 },
    };
    const first = await calls
      .get('apply_command')!
      .execute({ roomId: 'browser-room', command: envelope });
    const retry = await calls
      .get('apply_command')!
      .execute({ roomId: 'browser-room', command: envelope });
    const denied = await calls
      .get('read_room')!
      .execute({ roomId: 'foreign-room' });
    handle.dispose();
    return {
      available: handle.available,
      first,
      retry,
      denied,
      remaining: calls.size,
    };
  }, browserModule);
  expect(result).toMatchObject({
    available: true,
    first: { ok: true, data: { revision: 1, duplicate: false } },
    retry: { ok: true, data: { revision: 1, duplicate: true } },
    denied: { ok: false, error: { code: 'forbidden' } },
    remaining: 0,
  });
});
