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

it('requires edge-provided caller identity for new sessions and ignores body/forwarded-for spoofing', async () => {
  const worker = createSitesWorker({});
  const env = {
    DB: {
      prepare() {
        throw new Error('Identity must be checked before database access');
      },
    },
  };
  for (const headers of [
    { 'Content-Type': 'application/json' },
    {
      'Content-Type': 'application/json',
      'X-Forwarded-For': 'attacker-chosen',
    },
  ]) {
    const response = await worker.fetch(
      new Request('https://site.example/api/sessions/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'Guest',
          plan: {},
          actorKey: 'attacker-chosen',
        }),
      }),
      env,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: 'caller-unavailable' },
    });
  }
});

it('serves the public room shell only for valid room paths and keeps unknown paths private', async () => {
  const worker = createSitesWorker({
    '/room/:roomId': { body: '<h1>Room shell</h1>', contentType: 'text/html' },
  });
  const env = {
    DB: {
      prepare() {
        throw Error('No database access for public HTML');
      },
    },
  };
  const path = '/room/172be3fe-e426-46c2-84f4-765639fcebee';
  const response = await worker.fetch(
    new Request('https://site.example' + path),
    env,
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('Room shell');
  const head = await worker.fetch(
    new Request('https://site.example' + path, { method: 'HEAD' }),
    env,
  );
  expect(head.status).toBe(200);
  expect(await head.text()).toBe('');
  for (const invalid of [
    '/room/bad',
    '/room/172be3fe-e426-46c2-84f4-765639fcebee/secret',
    '/private.txt',
    '/assets/missing.js',
  ])
    expect(
      (await worker.fetch(new Request('https://site.example' + invalid), env))
        .status,
    ).toBe(404);
});
