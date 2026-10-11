import { expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/adapters/mcp';
import { createLocalApplication } from '../src/application';
import { createRoom } from '../src/domain/rooms';
import { syntheticCatalog } from '../src/domain/catalog';

test('MCP rejects invalid recipe map keys and values in the shared input schema', async () => {
  const app = createLocalApplication(
    createRoom({ roomId: 'room-a', ownerId: 'owner', ownerName: 'Owner' }),
    { roomId: 'room-a', participantId: 'owner' },
    syntheticCatalog,
  );
  const server = createMcpServer(app.execute);
  const client = new Client({ name: 'record-key-test', version: '1.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    for (const recipes of [
      { ['x'.repeat(129)]: 'example:press' },
      { '': 'example:press' },
      { 'example:plate': 'x'.repeat(129) },
      { 'example:plate': '' },
    ]) {
      const result = await client.callTool({
        name: 'solve_production',
        arguments: {
          roomId: 'room-a',
          input: {
            targets: [{ itemId: 'example:plate', rate: '20' }],
            recipes,
            imports: ['example:ore'],
          },
        },
      });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        ok: false,
        error: { code: 'invalid-input', message: 'Invalid tool arguments' },
      });
    }
    const valid = await client.callTool({
      name: 'solve_production',
      arguments: {
        roomId: 'room-a',
        input: {
          targets: [{ itemId: 'example:plate', rate: '20' }],
          recipes: {
            'example:plate': 'example:press',
            'example:ingot': 'example:smelt',
          },
          imports: ['example:ore'],
        },
      },
    });
    expect(valid.isError).toBe(false);
    expect(valid.structuredContent).toMatchObject({
      ok: true,
      data: { imports: [{ itemId: 'example:ore', rate: '30' }] },
    });
  } finally {
    await client.close();
    await server.close();
  }
});

test('MCP client lists and calls tools over the actual protocol', async () => {
  const calls: unknown[] = [];
  const server = createMcpServer(async (name, input) => {
    calls.push({ name, input });
    return { ok: true, data: { revision: 7 } };
  });
  const client = new Client({ name: 'satispire-test', version: '1.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
      'read_room',
      'apply_command',
      'solve_production',
      'generate_floors',
    ]);
    const result = await client.callTool({
      name: 'read_room',
      arguments: { roomId: 'room-a' },
    });
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({
      ok: true,
      data: { revision: 7 },
    });
    expect(calls).toEqual([{ name: 'read_room', input: { roomId: 'room-a' } }]);
    const invalid = await client.callTool({
      name: 'read_room',
      arguments: { roomId: 'room-a', participantId: 'owner' },
    });
    expect(invalid.isError).toBe(true);
    expect(calls).toHaveLength(1);
  } finally {
    await client.close();
    await server.close();
  }
});

test('domain authorization failure remains a tool error', async () => {
  const server = createMcpServer(async () => ({
    ok: false,
    error: { code: 'FORBIDDEN', message: 'Room access denied' },
  }));
  const client = new Client({ name: 'satispire-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    const result = await client.callTool({
      name: 'solve_production',
      arguments: { roomId: 'other', input: {} },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
  } finally {
    await client.close();
    await server.close();
  }
});

test('stdio client computes a real plan and versioned mutation', async () => {
  const { StdioClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/stdio.js'
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/adapters/stdio.ts'],
    stderr: 'pipe',
  });
  const client = new Client({ name: 'actual-stdio', version: '1.0.0' });
  await client.connect(transport);
  try {
    const plan = await client.callTool({
      name: 'solve_production',
      arguments: {
        roomId: 'local',
        input: {
          targets: [{ itemId: 'example:plate', rate: '20' }],
          recipes: {
            'example:plate': 'example:press',
            'example:ingot': 'example:smelt',
          },
          imports: ['example:ore'],
        },
      },
    });
    expect(plan.isError).toBe(false);
    expect(plan.structuredContent).toMatchObject({
      ok: true,
      data: { imports: [{ itemId: 'example:ore', rate: '30' }] },
    });
    const envelope = {
      id: 'actual-edit',
      expectedRevision: 0,
      command: { type: 'set-target', itemId: 'example:plate', rate: '20' },
    };
    const change = await client.callTool({
      name: 'apply_command',
      arguments: { roomId: 'local', command: envelope },
    });
    expect(change.structuredContent).toMatchObject({
      ok: true,
      data: { revision: 1, duplicate: false },
    });
    const again = await client.callTool({
      name: 'apply_command',
      arguments: { roomId: 'local', command: envelope },
    });
    expect(again.structuredContent).toMatchObject({
      ok: true,
      data: { revision: 1, duplicate: true },
    });
    const foreign = await client.callTool({
      name: 'read_room',
      arguments: { roomId: 'other' },
    });
    expect(foreign.isError).toBe(true);
    expect(foreign.structuredContent).toMatchObject({
      error: { code: 'forbidden' },
    });
  } finally {
    await client.close();
  }
});
