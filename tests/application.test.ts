import { expect, test } from 'vitest';
import { createRoom, createInvite, joinRoom } from '../src/domain/rooms';
import { createLocalApplication } from '../src/application';
import { syntheticCatalog } from '../src/domain/catalog';

const setup = () => {
  let room = createRoom({
    roomId: 'room-a',
    ownerId: 'owner',
    ownerName: 'Owner',
  });
  room = createInvite(
    room,
    { roomId: 'room-a', participantId: 'owner' },
    { id: 'invite', digest: 'test-digest', role: 'viewer' },
  );
  room = joinRoom(room, 'test-digest', { id: 'viewer', name: 'Viewer' });
  return room;
};
const command = {
  id: 'cmd-1',
  expectedRevision: 0,
  command: { type: 'set-block-rows', blockId: 'block-a', rows: 3 },
};
test('application command is authorized, atomic, versioned and idempotent', async () => {
  const app = createLocalApplication(
    setup(),
    { roomId: 'room-a', participantId: 'owner' },
    syntheticCatalog,
  );
  expect(
    await app.execute('apply_command', { roomId: 'room-a', command }),
  ).toMatchObject({ ok: true, data: { revision: 1, duplicate: false } });
  expect(
    await app.execute('apply_command', { roomId: 'room-a', command }),
  ).toMatchObject({ ok: true, data: { revision: 1, duplicate: true } });
  expect(await app.execute('read_room', { roomId: 'room-a' })).toMatchObject({
    ok: true,
    data: { revision: 1, intent: { blockRows: { 'block-a': 3 } } },
  });
  expect(
    await app.execute('apply_command', {
      roomId: 'room-a',
      command: { ...command, id: 'cmd-2' },
    }),
  ).toMatchObject({ ok: false, error: { code: 'revision-conflict' } });
});
test('tools cannot inject identity or read/compute in another room', async () => {
  const app = createLocalApplication(
    setup(),
    { roomId: 'room-a', participantId: 'viewer' },
    syntheticCatalog,
  );
  expect(
    await app.execute('apply_command', { roomId: 'room-a', command }),
  ).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  expect(
    await app.execute('read_room', {
      roomId: 'room-a',
      participantId: 'owner',
    }),
  ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  for (const name of [
    'read_room',
    'solve_production',
    'generate_floors',
  ] as const) {
    expect(
      await app.execute(name, { roomId: 'other', input: {} }),
    ).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  }
});
test('solver and geometry failures do not mutate the last room intent', async () => {
  const app = createLocalApplication(
    setup(),
    { roomId: 'room-a', participantId: 'owner' },
    syntheticCatalog,
  );
  expect(
    await app.execute('solve_production', {
      roomId: 'room-a',
      input: { targets: [], recipes: {}, imports: [] },
    }),
  ).toMatchObject({ ok: false });
  expect(
    await app.execute('generate_floors', { roomId: 'room-a', input: {} }),
  ).toMatchObject({ ok: false });
  expect(await app.execute('read_room', { roomId: 'room-a' })).toMatchObject({
    ok: true,
    data: { revision: 0 },
  });
});

test('both planner tools return real validated plans in the bound room', async () => {
  const app = createLocalApplication(
    setup(),
    { roomId: 'room-a', participantId: 'owner' },
    syntheticCatalog,
  );
  expect(
    await app.execute('solve_production', {
      roomId: 'room-a',
      input: {
        targets: [{ itemId: 'example:plate', rate: '20' }],
        recipes: {
          'example:plate': 'example:press',
          'example:ingot': 'example:smelt',
        },
        imports: ['example:ore'],
      },
    }),
  ).toMatchObject({
    ok: true,
    data: { imports: [{ itemId: 'example:ore', rate: '30' }] },
  });
  expect(
    await app.execute('generate_floors', {
      roomId: 'room-a',
      input: {
        footprint: { width: 32, depth: 32 },
        floorCount: 1,
        floorHeight: 8,
        blocks: [{ id: 'block-a', floor: 0, count: 8, rows: 3 }],
      },
    }),
  ).toMatchObject({
    ok: true,
    data: { floors: [{ blocks: [{ block: { rowCounts: [3, 3, 2] } }] }] },
  });
});
test('Vanilla factory tool enforces profile and dimensions shared schematic supply', async () => {
  const { vanillaCatalog, technologyAtTier, availableChoices } = await import(
    '../src/domain/vanilla.js'
  );
  const app = createLocalApplication(
    setup(),
    { roomId: 'room-a', participantId: 'owner' },
    vanillaCatalog,
  );
  const technology = { ...technologyAtTier(2), beltTier: 1 };
  const production = {
    targets: [{ itemId: 'Desc_IronPlate_C', rate: '320' }],
    recipes: availableChoices(technology),
    imports: ['Desc_OreIron_C'],
    technology,
  };
  const result = await app.execute(
    'plan_factory' as import('../src/adapters/webmcp.js').ToolName,
    { roomId: 'room-a', input: { production, rows: 3 } },
  );
  expect(result).toMatchObject({
    ok: true,
    data: {
      production: { imports: [{ itemId: 'Desc_OreIron_C', rate: '480' }] },
      layout: { units: 'logical' },
    },
  });
  const denied = await app.execute(
    'plan_factory' as import('../src/adapters/webmcp.js').ToolName,
    {
      roomId: 'room-a',
      input: {
        production: {
          ...production,
          technology: { ...technology, availableMachines: [] },
        },
        rows: 3,
      },
    },
  );
  expect(denied).toMatchObject({ ok: false, error: { code: 'planner-error' } });
});
