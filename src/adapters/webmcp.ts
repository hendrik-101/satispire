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
  | 'generate_floors'
  | 'plan_factory';
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
  {
    name: 'plan_factory',
    description:
      'Compute a technology-constrained production plan and supply/block schematic from the pinned catalog; physical geometry may be unknown.',
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
/** Disposal deactivates callbacks and retries pending removals; host failures raise AggregateError. */
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
  const registered = new Set<ToolName>();
  let active = true;
  const cleanup = (): unknown[] => {
    // Deactivate first: even failed removals cannot retain executable access.
    active = false;
    const failures: unknown[] = [];
    for (const name of registered) {
      try {
        context.unregisterTool(name);
        registered.delete(name);
      } catch (error) {
        failures.push(error);
      }
    }
    return failures;
  };
  const dispose = (): void => {
    const failures = cleanup();
    if (failures.length) {
      throw new AggregateError(
        failures,
        'WebMCP tool cleanup failed; retry disposal',
      );
    }
  };
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
        execute: async (input) =>
          active
            ? execute(definition.name, input)
            : {
                ok: false,
                error: {
                  code: 'adapter-disposed',
                  message: 'WebMCP tools are inactive',
                },
              },
      });
      registered.add(definition.name);
    }
  } catch {
    // Keep failures tracked on the returned handle so callers can retry cleanup.
    cleanup();
    return { available: false, dispose };
  }
  return { available: true, dispose };
}
