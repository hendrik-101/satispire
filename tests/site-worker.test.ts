import { expect, it } from 'vitest';
import { createSitesWorker } from '../src/runtime/site-worker';

it('serves an immutable exported workspace and advertises the hosted session transport', async () => {
  const worker = createSitesWorker({
    '/': {
      body: '<!doctype html><h1>Satispire</h1>',
      contentType: 'text/html; charset=utf-8',
    },
    '/assets/app-hash.js': {
      body: 'window.ready=true;',
      contentType: 'text/javascript; charset=utf-8',
    },
  });
  const env = {
    DB: {
      prepare() {
        throw new Error('Unexpected database call');
      },
    },
  };
  const root = await worker.fetch(
    new Request('https://site.example/?session=abc'),
    env,
  );
  expect(await root.text()).toContain('Satispire');
  expect(root.headers.get('cache-control')).toBe('no-store');
  expect(root.headers.get('content-security-policy')).toBe(
    "frame-ancestors 'self' https://chatgpt.com https://chat.openai.com",
  );
  const config = await worker.fetch(
    new Request('https://site.example/api/session-config'),
    env,
  );
  expect(await config.json()).toEqual({ transport: 'http' });
  const asset = await worker.fetch(
    new Request('https://site.example/assets/app-hash.js'),
    env,
  );
  expect(await asset.text()).toBe('window.ready=true;');
  expect(asset.headers.get('cache-control')).toContain('immutable');
  const head = await worker.fetch(
    new Request('https://site.example/', { method: 'HEAD' }),
    env,
  );
  expect(await head.text()).toBe('');
  expect(
    (await worker.fetch(new Request('https://site.example/missing'), env))
      .status,
  ).toBe(404);
  expect(
    (
      await worker.fetch(
        new Request('https://site.example/', { method: 'POST' }),
        env,
      )
    ).status,
  ).toBe(405);
});
