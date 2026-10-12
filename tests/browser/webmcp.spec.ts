import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createRoom } from '../../src/domain/rooms';
import { syntheticCatalog } from '../../src/domain/catalog';
import { createLocalApplication } from '../../src/application';
import { technologyAtTier, availableChoices } from '../../src/domain/vanilla';
import type { WebTool } from '../../src/adapters/webmcp';

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

test('actual workspace registers Vanilla tools and disposes retained callbacks', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const tools = new Map<string, unknown>();
    Object.assign(window, { workspaceTools: tools });
    Object.defineProperty(document, 'modelContext', {
      value: {
        registerTool: (tool: { name: string }) => tools.set(tool.name, tool),
        unregisterTool: (name: string) => tools.delete(name),
      },
    });
  });
  await page.goto(process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { workspaceTools: Map<string, unknown> })
            .workspaceTools.size,
      ),
    )
    .toBe(5);
  const technology = technologyAtTier(2);
  const production = {
    targets: [{ itemId: 'Desc_IronPlate_C', rate: '20' }],
    recipes: availableChoices(technology),
    imports: ['Desc_OreIron_C'],
    technology,
  };
  const result = await page.evaluate(async (production) => {
    const tools = (
      window as unknown as { workspaceTools: Map<string, WebTool> }
    ).workspaceTools;
    const plan = tools.get('plan_factory')!;
    const solved = await plan.execute({
      roomId: 'local',
      input: { production, rows: 3 },
    });
    const denied = await tools.get('read_room')!.execute({ roomId: 'foreign' });
    window.dispatchEvent(new Event('pagehide'));
    const disposed = await plan.execute({
      roomId: 'local',
      input: { production },
    });
    return { solved, denied, disposed, remaining: tools.size };
  }, production);
  expect(result).toMatchObject({
    solved: {
      ok: true,
      data: {
        production: { imports: [{ itemId: 'Desc_OreIron_C', rate: '30' }] },
        layout: { units: 'logical' },
      },
    },
    denied: { ok: false, error: { code: 'forbidden' } },
    disposed: { ok: false, error: { code: 'adapter-disposed' } },
    remaining: 0,
  });
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    ),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { workspaceTools: Map<string, unknown> })
            .workspaceTools.size,
      ),
    )
    .toBe(5);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { workspaceTools: Map<string, unknown> })
            .workspaceTools.size,
      ),
    )
    .toBe(5);
});

test('host registration failure preserves the actual UI planning workflow', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'modelContext', {
      value: {
        registerTool: () => {
          throw new Error('host unavailable');
        },
        unregisterTool: () => {},
      },
    });
  });
  await page.goto(process.env.SATISPIRE_BASE_URL ?? 'http://127.0.0.1:4173');
  await expect(page.locator('main.workspace')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByLabel('Zielrate pro Minute').fill('40');
  await page
    .getByRole('button', { name: 'Plan berechnen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(
    page.getByText('40 / min', { exact: true }).first(),
  ).toBeVisible();
});
