import { expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/adapters/mcp.js';
import { registerWebMcp, type WebTool } from '../src/adapters/webmcp.js';
import { createLocalApplication } from '../src/application.js';
import { createRoom } from '../src/domain/rooms.js';
import {
  vanillaCatalog,
  technologyAtTier,
  availableChoices,
} from '../src/domain/vanilla.js';
import { generateSupplyLayout } from '../src/domain/supply-layout.js';
import { solveProduction } from '../src/domain/production.js';
import { defaultBuildVariant } from '../src/domain/build-variants.js';
it('returns identical variant contracts through actual classic MCP and WebMCP', async () => {
  const technology = technologyAtTier(2);
  const production = {
    targets: [{ itemId: 'Desc_IronPlateReinforced_C', rate: '20' }],
    recipes: availableChoices(technology),
    imports: vanillaCatalog.items.filter((i) => i.raw).map((i) => i.id),
    technology,
  };
  const app = createLocalApplication(
    createRoom({ roomId: 'local', ownerId: 'owner', ownerName: 'Owner' }),
    { roomId: 'local', participantId: 'owner' },
    vanillaCatalog,
  );
  const tools = new Map<string, WebTool>();
  const handle = registerWebMcp(
    {
      modelContext: {
        registerTool(t) {
          tools.set(t.name, t);
        },
        unregisterTool(n) {
          tools.delete(n);
        },
      },
    },
    app.execute,
  );
  const server = createMcpServer(app.execute);
  const client = new Client({ name: 'variants', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    for (const variant of [
      defaultBuildVariant,
      {
        ...defaultBuildVariant,
        pattern: 'fixed' as const,
        inputSide: 'west' as const,
        outputSide: 'west' as const,
      },
      {
        ...defaultBuildVariant,
        inputSide: 'north' as const,
        outputSide: 'south' as const,
      },
    ]) {
      const args = { roomId: 'local', input: { production, rows: 2, variant } };
      const expected = {
        ok: true,
        data: {
          production: solveProduction(vanillaCatalog, production),
          layout: generateSupplyLayout(
            vanillaCatalog,
            solveProduction(vanillaCatalog, production),
            technology,
            2,
            variant,
          ),
        },
      };
      expect(await tools.get('plan_factory')!.execute(args)).toEqual(expected);
      expect(
        (await client.callTool({ name: 'plan_factory', arguments: args }))
          .structuredContent,
      ).toEqual(expected);
    }
    const excessive = {
      roomId: 'local',
      input: {
        production,
        variant: {
          ...defaultBuildVariant,
          overrides: Array.from({ length: 65 }, () => ({
            itemId: 'Desc_IronPlateReinforced_C',
            inputSide: 'west',
            outputSide: 'east',
          })),
        },
      },
    };
    expect(await tools.get('plan_factory')!.execute(excessive)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(
      (await client.callTool({ name: 'plan_factory', arguments: excessive }))
        .structuredContent,
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    const sparse = new Array(1_000_000_000);
    let reads = 0;
    Object.defineProperty(sparse, 0, {
      get() {
        reads++;
        throw new Error('must not read');
      },
    });
    expect(
      await tools.get('plan_factory')!.execute({
        ...excessive,
        input: {
          production,
          variant: { ...defaultBuildVariant, overrides: sparse },
        },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(reads).toBe(0);
    expect(
      await tools
        .get('plan_factory')!
        .execute({ ...excessive, roomId: 'foreign' }),
    ).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    const invalid = {
      roomId: 'local',
      input: {
        production,
        variant: { ...defaultBuildVariant, inputSide: 'up' },
      },
    };
    expect(await tools.get('plan_factory')!.execute(invalid)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(
      (await client.callTool({ name: 'plan_factory', arguments: invalid }))
        .structuredContent,
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  } finally {
    handle.dispose();
    await client.close();
    await server.close();
  }
});
