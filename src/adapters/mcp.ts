import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolDefinitions, type ToolExecutor } from './webmcp.js';

export function createMcpServer(execute: ToolExecutor): McpServer {
  const server = new McpServer({ name: 'satispire', version: '0.1.0' });
  for (const definition of toolDefinitions) {
    const inputSchema = z
      .object({
        roomId: z.string().min(1).max(128),
        ...(definition.argument
          ? { [definition.argument]: z.record(z.unknown()) }
          : {}),
      })
      .strict();
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema,
      },
      async (input) => {
        const result = await execute(definition.name, input);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: { ...result },
          isError: !result.ok,
        };
      },
    );
  }
  return server;
}
