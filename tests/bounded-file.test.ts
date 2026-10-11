import { execFile } from 'node:child_process';
import { mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_INPUT_BYTES, readBoundedUtf8File } from '../src/bounded-file.js';

const execute = promisify(execFile);
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'satispire-file-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('bounded UTF-8 files', () => {
  it('accepts an exact byte boundary even with multibyte Unicode', async () => {
    const path = join(directory, 'unicode.json');
    const text = 'Aé🙂Z';
    expect(Buffer.byteLength(text)).toBe(8);
    await writeFile(path, text);
    expect(await readBoundedUtf8File(path, 8)).toBe(text);
    await expect(readBoundedUtf8File(path, 7)).rejects.toThrow(/7-byte limit/);
  });

  it('rejects a real file larger than the default limit', async () => {
    const path = join(directory, 'oversized.json');
    await writeFile(path, '');
    await truncate(path, MAX_INPUT_BYTES + 1);
    await expect(readBoundedUtf8File(path)).rejects.toThrow(
      /8000000-byte limit/,
    );
  });

  it('decodes Unicode split across read chunks without corruption', async () => {
    const path = join(directory, 'chunk-boundary.json');
    const text = 'a'.repeat(65_535) + '🙂é';
    await writeFile(path, text);
    expect(await readBoundedUtf8File(path, Buffer.byteLength(text))).toBe(text);
  });

  it('accepts an empty regular file for the caller to parse', async () => {
    const path = join(directory, 'empty.json');
    await writeFile(path, '');
    expect(await readBoundedUtf8File(path)).toBe('');
  });

  it('supports symlinks to regular files while rejecting directories', async () => {
    const path = join(directory, 'input.json');
    const alias = join(directory, 'alias.json');
    await writeFile(path, '[]');
    await symlink(path, alias);
    expect(await readBoundedUtf8File(alias)).toBe('[]');
    await expect(readBoundedUtf8File(directory)).rejects.toThrow(
      /regular file/,
    );
  });

  it('rejects a real FIFO without waiting for a writer', async () => {
    const path = join(directory, 'pipe');
    await execute('mkfifo', [path]);
    await expect(readBoundedUtf8File(path)).rejects.toThrow(/regular file/);
    const alias = join(directory, 'pipe-alias');
    await symlink(path, alias);
    await expect(readBoundedUtf8File(alias)).rejects.toThrow(/regular file/);
  }, 2000);

  it.each([-1, NaN, Infinity, 1.5, MAX_INPUT_BYTES + 1])(
    'rejects invalid byte limits %s',
    async (limit) => {
      await expect(
        readBoundedUtf8File(join(directory, 'absent'), limit),
      ).rejects.toThrow(/byte limit/i);
    },
  );
});
