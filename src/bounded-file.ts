import { constants } from 'node:fs';
import { open, stat } from 'node:fs/promises';

export const MAX_INPUT_BYTES = 8_000_000;

/** Read only a regular file and consume at most limit + 1 raw bytes. */
export async function readBoundedUtf8File(
  path: string,
  limit: number = MAX_INPUT_BYTES,
): Promise<string> {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_INPUT_BYTES) {
    throw new Error(
      `Byte limit must be an integer from 0 to ${MAX_INPUT_BYTES}`,
    );
  }
  const tooLarge = () => new Error(`Input exceeds ${limit}-byte limit`);
  const before = await stat(path);
  if (!before.isFile()) throw new Error('Input must be a regular file');
  if (before.size > limit) throw tooLarge();
  // Nonblocking open also handles a path changed to a FIFO after the stat.
  // Fail closed on platforms that cannot provide that guarantee.
  if (typeof constants.O_NONBLOCK !== 'number') {
    throw new Error(
      'Safe nonblocking file open is unavailable on this platform',
    );
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw new Error('Input must be a regular file');
    if (opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error(
        'Input file changed while opening; retry with a stable regular file',
      );
    }
    if (opened.size > limit) throw tooLarge();
    const buffer = Buffer.alloc(Math.min(65_536, limit + 1));
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, limit + 1 - total),
        null,
      );
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > limit) throw tooLarge();
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    return Buffer.concat(chunks, total).toString('utf8');
  } finally {
    await handle.close();
  }
}
