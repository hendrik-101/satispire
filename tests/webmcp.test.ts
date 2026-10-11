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
  expect(registered.size).toBe(4);
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
