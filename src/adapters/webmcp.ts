/** Early-preview WebMCP surface. No assumption about a particular AI client. */
export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}
export type ToolName =
  | 'read_room'
  | 'apply_command'
  | 'solve_production'
  | 'generate_floors';
export type ToolExecutor = (
  name: ToolName,
  input: unknown,
) => Promise<ToolResult>;
export const toolDefinitions = [
  {
    name: 'read_room',
    description: 'Read the authorized room and its current revision.',
    argument: undefined,
  },
  {
    name: 'apply_command',
    description: 'Apply an authorized, versioned, idempotent room command.',
    argument: 'command',
  },
  {
    name: 'solve_production',
    description:
      'Compute exact rates using explicit recipe choices and the pinned catalog.',
    argument: 'input',
  },
  {
    name: 'generate_floors',
    description:
      'Generate synthetic logical-grid floors and continuous lift reservations.',
    argument: 'input',
  },
] as const;
export interface WebTool {
  name: ToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: unknown) => Promise<ToolResult>;
}
export interface ModelContext {
  registerTool(tool: WebTool): void;
  unregisterTool(name: string): void;
}
export function registerWebMcp(
  document: { modelContext?: ModelContext },
  execute: ToolExecutor,
): { available: boolean; dispose: () => void } {
  const context = document.modelContext;
  if (
    !context ||
    typeof context.registerTool !== 'function' ||
    typeof context.unregisterTool !== 'function'
  ) {
    return { available: false, dispose: () => {} };
  }
  const registered: ToolName[] = [];
  try {
    for (const definition of toolDefinitions) {
      context.registerTool({
        name: definition.name,
        description: definition.description,
        inputSchema: {
          type: 'object',
          properties: {
            roomId: { type: 'string' },
            ...(definition.argument
              ? { [definition.argument]: { type: 'object' } }
              : {}),
          },
          required: [
            'roomId',
            ...(definition.argument ? [definition.argument] : []),
          ],
          additionalProperties: false,
        },
        execute: (input) => execute(definition.name, input),
      });
      registered.push(definition.name);
    }
  } catch {
    for (const name of registered) context.unregisterTool(name);
    return { available: false, dispose: () => {} };
  }
  return {
    available: true,
    dispose: () => {
      for (const name of registered.splice(0)) context.unregisterTool(name);
    },
  };
}
