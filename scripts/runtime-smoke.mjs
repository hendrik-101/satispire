import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
const info = JSON.parse(
  await readFile(
    new URL('../web-dist/build-info.json', import.meta.url),
    'utf8',
  ),
);
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const child = spawn(process.execPath, ['dist/runtime/serve.js'], {
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    APP_REVISION: 'b'.repeat(40),
    NODE_ENV: 'production',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (data) => (output += data));
child.stderr.on('data', (data) => (output += data));
const exited = new Promise((resolve) =>
  child.once('exit', (code, signal) => resolve({ code, signal })),
);
const base = `http://127.0.0.1:${port}`;
try {
  let healthy = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Runtime exited: ${output}`);
    healthy = await fetch(`${base}/healthz`, {
      signal: AbortSignal.timeout(500),
    })
      .then((r) => r.status === 200)
      .catch(() => false);
    if (healthy) break;
    await delay(100);
  }
  assert(healthy, `Runtime failed readiness: ${output}`);
  assert.deepEqual(await (await fetch(`${base}/version.json`)).json(), info);
  assert.equal(
    spawnSync(process.execPath, ['dist/runtime/healthcheck.js'], {
      env: { ...process.env, PORT: String(port) },
    }).status,
    0,
  );
  const root = await fetch(base);
  assert.equal(root.status, 200);
  const html = await root.text();
  assert.match(html, /Satispire/);
  const assets = [
    ...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g),
  ].map((m) => m[1]);
  assert(
    assets.some((p) => p.endsWith('.js')) &&
      assets.some((p) => p.endsWith('.css')),
    'Actual SSR must reference executable JS and CSS',
  );
  for (const path of new Set(assets)) {
    const response = await fetch(base + path, {
      headers: { 'Accept-Encoding': 'br' },
    });
    assert.equal(response.headers.get('content-encoding'), null);
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get('content-type'),
      path.endsWith('.css') ? /css/ : /javascript/,
    );
    assert((await response.text()).length > 0);
  }
  assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
  assert.equal(
    (await fetch(base, { method: 'POST', body: 'unsupported' })).status,
    405,
  );
  child.kill('SIGTERM');
  const end = await Promise.race([
    exited,
    delay(8000).then(() => {
      throw new Error('SIGTERM did not finish within 8s');
    }),
  ]);
  assert.equal(end.code, 0);
  assert.equal(
    spawnSync(process.execPath, ['dist/runtime/healthcheck.js'], {
      env: { ...process.env, PORT: String(port) },
    }).status,
    1,
  );
  console.log(
    'Production HTTP smoke passed: actual SSR/assets, immutable revision, health probe, write refusal and SIGTERM.',
  );
} finally {
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await exited;
  }
}
