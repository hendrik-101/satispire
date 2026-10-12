import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syntheticCatalog } from '../src/domain/catalog.js';

const execute = promisify(execFile);
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'satispire-cli-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function runCli(args: string[]): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'src/cli.ts', ...args],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '',
      stderr = '',
      timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 3000);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

describe('CLI bounded file inputs', () => {
  it.each(['--input', '--catalog'])(
    'rejects oversized UTF-8 bytes through %s before parsing or validation',
    async (flag) => {
      const path = join(directory, 'unicode.json');
      await writeFile(path, JSON.stringify({ value: 'é'.repeat(4_000_001) }));
      const result = await runCli(['--demo', flag, path]);
      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/8000000-byte limit/);
      expect(result.stdout).toBe('');
    },
  );

  it.each(['--input', '--catalog'])(
    'rejects a FIFO through %s without blocking',
    async (flag) => {
      const path = join(directory, 'fifo');
      await execute('mkfifo', [path]);
      const result = await runCli(['--demo', flag, path]);
      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/regular file/);
    },
  );

  it('preserves valid plan and catalog file workflows', async () => {
    const plan = join(directory, 'plan.json'),
      catalog = join(directory, 'catalog.json');
    await writeFile(
      plan,
      JSON.stringify({
        schemaVersion: 1,
        production: {
          targets: [{ itemId: 'example:plate', rate: '20' }],
          recipes: {
            'example:ingot': 'example:smelt',
            'example:plate': 'example:press',
          },
          imports: ['example:ore'],
        },
        layout: {
          footprint: { width: 32, depth: 32 },
          floorHeight: 8,
          rows: 2,
        },
      }),
    );
    await writeFile(catalog, JSON.stringify(syntheticCatalog));
    const result = await runCli(['--input', plan, '--catalog', catalog]);
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).production.imports).toEqual([
      { itemId: 'example:ore', rate: '30' },
    ]);
  });

  it('plans a normalized catalog with 256-character item, machine, and recipe IDs', async () => {
    const allIds = [
      ...syntheticCatalog.items,
      ...syntheticCatalog.machines,
      ...syntheticCatalog.recipes,
    ].map((entry) => entry.id);
    const ids = new Map(
      allIds.map((id, index) => [id, `local:${index}:`.padEnd(256, 'x')]),
    );
    const id = (value: string) => ids.get(value)!;
    const normalizedCatalog = {
      ...syntheticCatalog,
      items: syntheticCatalog.items.map((item) => ({
        ...item,
        id: id(item.id),
      })),
      machines: syntheticCatalog.machines.map((machine) => ({
        ...machine,
        id: id(machine.id),
      })),
      recipes: syntheticCatalog.recipes.map((recipe) => ({
        ...recipe,
        id: id(recipe.id),
        machineId: id(recipe.machineId),
        inputs: recipe.inputs.map((part) => ({
          ...part,
          itemId: id(part.itemId),
        })),
        outputs: recipe.outputs.map((part) => ({
          ...part,
          itemId: id(part.itemId),
        })),
      })),
    };
    const plan = join(directory, 'long-plan.json'),
      catalog = join(directory, 'long-catalog.json');
    await writeFile(
      plan,
      JSON.stringify({
        schemaVersion: 1,
        production: {
          targets: [{ itemId: id('example:plate'), rate: '20' }],
          recipes: {
            [id('example:ingot')]: id('example:smelt'),
            [id('example:plate')]: id('example:press'),
          },
          imports: [id('example:ore')],
        },
        layout: {
          footprint: { width: 32, depth: 32 },
          floorHeight: 8,
          rows: 2,
        },
      }),
    );
    await writeFile(catalog, JSON.stringify(normalizedCatalog));
    const result = await runCli(['--input', plan, '--catalog', catalog]);
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    const document = JSON.parse(result.stdout);
    expect(document.production.imports).toEqual([
      { itemId: id('example:ore'), rate: '30' },
    ]);
    expect(
      document.layoutBindings.blocks.map(
        (binding: { itemId: string }) => binding.itemId,
      ),
    ).toEqual(
      document.production.nodes.map((node: { itemId: string }) => node.itemId),
    );
    expect(
      document.layout.floors
        .flatMap((floor: { blocks: { id: string }[] }) => floor.blocks)
        .every((block: { id: string }) => block.id.length <= 128),
    ).toBe(true);
    expect(
      document.layout.connections.every(
        (connection: { id: string }) => connection.id.length <= 128,
      ),
    ).toBe(true);
  });
});
