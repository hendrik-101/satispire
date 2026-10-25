import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHttpRuntime } from '../src/runtime/http.js';
const revision = 'a'.repeat(40);
let directory: string;
let server: Awaited<ReturnType<typeof startHttpRuntime>> | undefined;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'satispire-http-'));
  await mkdir(join(directory, 'client/assets'), { recursive: true });
  await mkdir(join(directory, 'server'));
  await writeFile(
    join(directory, 'build-info.json'),
    JSON.stringify({ revision }),
  );
  await writeFile(
    join(directory, 'client/assets/app-test.js'),
    'window.satispire = true;',
  );
  await writeFile(
    join(directory, 'client/assets/app-test.css'),
    'body { color: blue }',
  );
  await writeFile(join(directory, 'private.txt'), 'PRIVATE_FILE_CONTENT');
  await writeFile(
    join(directory, 'server/server.js'),
    `export default { fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/error') throw new Error('PRIVATE_ERROR_DETAIL');
    if (url.pathname === '/stream') return new Response(new ReadableStream({start(c) {c.enqueue(new TextEncoder().encode('streamed')); c.close()}}));
    return Response.json({ path: url.pathname, host: url.host, protocol: url.protocol, method: request.method });
  }};`,
  );
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
});
afterEach(async () => {
  await server?.close(true);
  server = undefined;
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});
async function start() {
  server = await startHttpRuntime({
    buildDirectory: directory,
    port: 0,
    gracefulShutdown: false,
  });
  return server.url!;
}
describe('HTTP runtime', () => {
  test('provides uncached health and fixed revision with GET and body-free HEAD', async () => {
    const base = await start();
    const health = await fetch(new URL('/healthz', base));
    expect(await health.json()).toEqual({ status: 'ok' });
    expect(health.headers.get('cache-control')).toBe('no-store');
    const version = await fetch(new URL('/version.json', base));
    expect(await version.json()).toEqual({ revision });
    const head = await fetch(new URL('/version.json', base), {
      method: 'HEAD',
    });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });
  test('serves real JavaScript/CSS files and missing assets return 404', async () => {
    const base = await start();
    const js = await fetch(new URL('/assets/app-test.js', base));
    expect(js.headers.get('content-type')).toContain('javascript');
    expect(await js.text()).toContain('window.satispire');
    const css = await fetch(new URL('/assets/app-test.css', base));
    expect(css.headers.get('content-type')).toContain('css');
    expect(await css.text()).toContain('blue');
    expect((await fetch(new URL('/assets/missing.js', base))).status).toBe(404);
  });
  test('does not serve private files or encoded traversal outside client assets', async () => {
    const base = await start();
    for (const path of [
      '/private.txt',
      '/assets/%2e%2e/%2e%2e/private.txt',
      '/assets/..%2f..%2fprivate.txt',
      '/server/server.js',
    ]) {
      const response = await fetch(new URL(path, base));
      expect(await response.text()).not.toMatch(
        /PRIVATE_FILE_CONTENT|PRIVATE_ERROR_DETAIL|export default/,
      );
    }
  });
  test('passes native requests to SSR and ignores forwarded URL headers', async () => {
    const base = await start();
    const response = await fetch(new URL('/planner?x=1', base), {
      headers: {
        'x-forwarded-host': 'attacker.invalid',
        'x-forwarded-proto': 'https',
      },
    });
    expect(response.headers.get('content-security-policy')).toBe(
      "frame-ancestors 'self' https://chatgpt.com https://chat.openai.com",
    );
    expect(await response.json()).toMatchObject({
      path: '/planner',
      host: new URL(base).host,
      protocol: 'http:',
      method: 'GET',
    });
  });
  test('rejects HTTP writes instead of exposing a backend', async () => {
    const base = await start();
    for (const path of [
      '/',
      '/healthz',
      '/version.json',
      '/assets/app-test.js',
    ]) {
      const response = await fetch(new URL(path, base), {
        method: 'POST',
        body: 'untrusted',
      });
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
    }
  });
  test('streams SSR output and returns generic errors without details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = await start();
    expect(await (await fetch(new URL('/stream', base))).text()).toBe(
      'streamed',
    );
    const error = await fetch(new URL('/error', base));
    expect(error.status).toBe(500);
    expect(await error.text()).toBe('Internal Server Error');
  });
  test('serves assets without per-request compression for br and gzip clients', async () => {
    const base = await start();
    for (const encoding of ['br', 'gzip', 'br, gzip']) {
      const response = await fetch(new URL('/assets/app-test.js', base), {
        headers: { 'Accept-Encoding': encoding },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-encoding')).toBeNull();
      expect(await response.text()).toBe('window.satispire = true;');
    }
  });
  test('records the exception in private operator logs while returning a generic 500', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = await start();
    const response = await fetch(new URL('/error', base));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Internal Server Error');
    expect(log).toHaveBeenCalledWith(
      'Satispire HTTP request failed',
      expect.objectContaining({ message: 'PRIVATE_ERROR_DETAIL' }),
    );
  });
  test('refuses invalid immutable revision before starting', async () => {
    await writeFile(
      join(directory, 'build-info.json'),
      JSON.stringify({ revision: 'wrong' }),
    );
    await expect(start()).rejects.toThrow();
  });
  test('refuses incomplete client output before starting', async () => {
    await rm(join(directory, 'client/assets'), { recursive: true });
    await expect(start()).rejects.toThrow();
  });
  test('refuses a missing server entry before starting', async () => {
    await rm(join(directory, 'server/server.js'));
    await expect(start()).rejects.toThrow();
  });
  test('refuses invalid listener settings', async () => {
    for (const port of [-1, 65536, 1.5])
      await expect(
        startHttpRuntime({
          buildDirectory: directory,
          port,
          gracefulShutdown: false,
        }),
      ).rejects.toThrow();
    await expect(
      startHttpRuntime({
        buildDirectory: directory,
        hostname: 'remote.invalid',
        gracefulShutdown: false,
      }),
    ).rejects.toThrow();
  });
  test('stops accepting connections when closed', async () => {
    const base = await start();
    await server!.close(true);
    server = undefined;
    await expect(fetch(new URL('/healthz', base))).rejects.toThrow();
  });
});
