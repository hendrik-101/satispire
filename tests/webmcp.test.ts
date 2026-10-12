import { expect, test } from 'vitest';
import { registerWebMcp, type ModelContext } from '../src/adapters/webmcp';

test('feature detection preserves fallback without modelContext', () => {
  expect(registerWebMcp({}, async () => ({ ok: true, data: {} }))).toEqual({
    available: false,
    dispose: expect.any(Function),
  });
});

test('registered tools execute application functions and propagate structured failures', async () => {
  const registered = new Map<
    string,
    Parameters<ModelContext['registerTool']>[0]
  >();
  const modelContext: ModelContext = {
    registerTool(tool) {
      registered.set(tool.name, tool);
    },
    unregisterTool(name) {
      registered.delete(name);
    },
  };
  const calls: unknown[] = [];
  const handle = registerWebMcp({ modelContext }, async (name, input) => {
    calls.push({ name, input });
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Room access denied' },
    };
  });
  expect(handle.available).toBe(true);
  expect(registered.size).toBe(5);
  const result = await registered
    .get('solve_production')!
    .execute({ roomId: 'room-a', input: {} });
  expect(result).toEqual({
    ok: false,
    error: { code: 'FORBIDDEN', message: 'Room access denied' },
  });
  expect(calls).toEqual([
    { name: 'solve_production', input: { roomId: 'room-a', input: {} } },
  ]);
  handle.dispose();
  expect(registered.size).toBe(0);
});

test('disposal attempts all tools and retries only failed removals', async () => {
  const registered = new Map<
    string,
    Parameters<ModelContext['registerTool']>[0]
  >();
  const attempts: string[] = [];
  let failRemoval = true;
  let mutations = 0;
  const modelContext: ModelContext = {
    registerTool(tool) {
      registered.set(tool.name, tool);
    },
    unregisterTool(name) {
      attempts.push(name);
      if (name === 'apply_command' && failRemoval) throw new Error('host busy');
      registered.delete(name);
    },
  };
  const handle = registerWebMcp({ modelContext }, async () => {
    mutations += 1;
    return { ok: true };
  });
  const retainedCallback = registered.get('apply_command')!;
  expect(() => handle.dispose()).toThrow(AggregateError);
  expect(attempts).toEqual([
    'read_room',
    'apply_command',
    'solve_production',
    'generate_floors',
    'plan_factory',
  ]);
  expect([...registered.keys()]).toEqual(['apply_command']);
  expect(
    await retainedCallback.execute({ roomId: 'room-a', command: {} }),
  ).toEqual({
    ok: false,
    error: { code: 'adapter-disposed', message: 'WebMCP tools are inactive' },
  });
  expect(mutations).toBe(0);
  failRemoval = false;
  handle.dispose();
  expect(attempts).toEqual([
    'read_room',
    'apply_command',
    'solve_production',
    'generate_floors',
    'plan_factory',
    'apply_command',
  ]);
  expect(registered.size).toBe(0);
  handle.dispose();
  expect(attempts).toHaveLength(6);
});

test('partial registration failure keeps failed cleanup retryable and all callbacks inactive', async () => {
  const registered = new Map<
    string,
    Parameters<ModelContext['registerTool']>[0]
  >();
  const callbacks: Parameters<ModelContext['registerTool']>[0][] = [];
  const attempts: string[] = [];
  let failRemoval = true;
  let executions = 0;
  const modelContext: ModelContext = {
    registerTool(tool) {
      callbacks.push(tool);
      if (tool.name === 'generate_floors')
        throw new Error('host rejected registration');
      registered.set(tool.name, tool);
    },
    unregisterTool(name) {
      attempts.push(name);
      if (name === 'read_room' && failRemoval) throw new Error('host busy');
      registered.delete(name);
    },
  };
  const handle = registerWebMcp({ modelContext }, async () => {
    executions += 1;
    return { ok: true };
  });
  expect(handle.available).toBe(false);
  expect(attempts).toEqual(['read_room', 'apply_command', 'solve_production']);
  expect([...registered.keys()]).toEqual(['read_room']);
  for (const callback of callbacks) {
    expect((await callback.execute({ roomId: 'room-a' })).error?.code).toBe(
      'adapter-disposed',
    );
  }
  expect(executions).toBe(0);
  failRemoval = false;
  handle.dispose();
  expect(attempts).toEqual([
    'read_room',
    'apply_command',
    'solve_production',
    'read_room',
  ]);
  expect(registered.size).toBe(0);
});

test('retained references stop executing even after successful disposal', async () => {
  const callbacks: Parameters<ModelContext['registerTool']>[0][] = [];
  let executions = 0;
  const handle = registerWebMcp(
    {
      modelContext: {
        registerTool(tool) {
          callbacks.push(tool);
        },
        unregisterTool() {},
      },
    },
    async () => {
      executions += 1;
      return { ok: true };
    },
  );
  handle.dispose();
  expect(
    (await callbacks[1]!.execute({ roomId: 'room-a', command: {} })).error
      ?.code,
  ).toBe('adapter-disposed');
  expect(executions).toBe(0);
});

test('registration collision preserves the existing host tool and disables the rejected callback', async () => {
  const existing = {
    name: 'generate_floors' as const,
    description: 'Other adapter',
    inputSchema: {},
    execute: async () => ({ ok: true, data: 'other adapter' }),
  };
  const registered = new Map<
    string,
    Parameters<ModelContext['registerTool']>[0]
  >([['generate_floors', existing]]);
  const callbacks: Parameters<ModelContext['registerTool']>[0][] = [];
  const attempts: string[] = [];
  let executions = 0;
  const handle = registerWebMcp(
    {
      modelContext: {
        registerTool(tool) {
          callbacks.push(tool);
          if (registered.has(tool.name)) throw new Error('duplicate name');
          registered.set(tool.name, tool);
        },
        unregisterTool(name) {
          attempts.push(name);
          registered.delete(name);
        },
      },
    },
    async () => {
      executions += 1;
      return { ok: true };
    },
  );
  expect(handle.available).toBe(false);
  expect(attempts).toEqual(['read_room', 'apply_command', 'solve_production']);
  expect(registered.get('generate_floors')).toBe(existing);
  expect((await callbacks[3]!.execute({ roomId: 'room-a' })).error?.code).toBe(
    'adapter-disposed',
  );
  expect(executions).toBe(0);
  handle.dispose();
  expect(await existing.execute()).toEqual({ ok: true, data: 'other adapter' });
  expect(registered.size).toBe(1);
});

test('host-retained callback from a throwing registration is inactive', async () => {
  let retained: Parameters<ModelContext['registerTool']>[0] | undefined;
  let executions = 0;
  const handle = registerWebMcp(
    {
      modelContext: {
        registerTool(tool) {
          retained = tool;
          throw new Error('host failed after retaining callback');
        },
        unregisterTool() {
          throw new Error('no confirmed registration to remove');
        },
      },
    },
    async () => {
      executions += 1;
      return { ok: true };
    },
  );
  expect(handle.available).toBe(false);
  expect((await retained!.execute({ roomId: 'room-a' })).error?.code).toBe(
    'adapter-disposed',
  );
  expect(executions).toBe(0);
  expect(() => handle.dispose()).not.toThrow();
});
