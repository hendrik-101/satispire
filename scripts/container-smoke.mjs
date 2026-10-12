import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const revision = process.env.APP_REVISION;
assert.match(
  revision ?? '',
  /^[a-f0-9]{40}$/,
  'Set APP_REVISION to the checked-out commit',
);
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
assert(
  (process.env.DOCKER_HOST ?? 'unix:///var/run/docker.sock').startsWith(
    'unix://',
  ),
  'Smoke may use only a local Unix Docker socket',
);
assert(
  docker(
    'context',
    'inspect',
    '--format',
    '{{.Endpoints.docker.Host}}',
  ).startsWith('unix://'),
  'Smoke may use only a local Docker context',
);
const id = randomUUID().replaceAll('-', '');
const name = `satispire-smoke-${id}`;
const image = `satispire-smoke:${id}`;
const composeEnv = {
  ...process.env,
  SATISPIRE_IMAGE: 'ghcr.io/hendrik-101/satispire@sha256:' + 'a'.repeat(64),
  SATISPIRE_HOST_PORT: '3202',
  CLOUDFLARED_WEB_NETWORK: 'cloudflared-web',
};
const rendered = JSON.parse(
  execFileSync(
    'docker',
    ['compose', '-f', 'deploy/compose.test.yml', 'config', '--format', 'json'],
    { env: composeEnv, encoding: 'utf8' },
  ),
);
assert.equal(rendered.services.app.ports[0].host_ip, '127.0.0.1');
assert.equal(rendered.services.app.read_only, true);
assert.deepEqual(rendered.services.app.cap_drop, ['ALL']);
assert.equal(rendered.networks.web.external, true);
let built = false,
  created = false;
try {
  const build = spawn(
    'docker',
    ['build', '--build-arg', `APP_REVISION=${revision}`, '-t', image, '.'],
    { stdio: 'inherit' },
  );
  const code = await new Promise((resolve) => build.once('exit', resolve));
  assert.equal(code, 0);
  built = true;
  docker(
    'run',
    '-d',
    '--name',
    name,
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--memory=512m',
    '--pids-limit=128',
    '--tmpfs',
    '/tmp:rw,size=64m,mode=1777',
    '-p',
    '127.0.0.1::3000',
    image,
  );
  created = true;
  let state;
  for (let i = 0; i < 60; i++) {
    state = JSON.parse(docker('inspect', '--format', '{{json .State}}', name));
    if (state.Health?.Status === 'healthy') break;
    if (!state.Running) break;
    await delay(1000);
  }
  assert.equal(state.Health?.Status, 'healthy');
  const config = JSON.parse(
    docker('inspect', '--format', '{{json .Config}}', name),
  );
  assert.equal(config.User, 'node');
  assert.equal(config.Labels['org.opencontainers.image.revision'], revision);
  assert.equal(docker('exec', name, 'id', '-u'), '1000');
  const ports = JSON.parse(
    docker('inspect', '--format', '{{json .NetworkSettings.Ports}}', name),
  );
  assert.equal(ports['3000/tcp'][0].HostIp, '127.0.0.1');
  const base = `http://127.0.0.1:${ports['3000/tcp'][0].HostPort}`;
  assert.deepEqual(await (await fetch(`${base}/version.json`)).json(), {
    revision,
  });
  const root = await fetch(base);
  assert.equal(root.status, 200);
  const html = await root.text();
  assert.match(html, /Satispire/);
  const assets = [
    ...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g),
  ].map((m) => m[1]);
  assert(assets.length > 0);
  for (const path of new Set(assets))
    assert.equal((await fetch(base + path)).status, 200);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  docker('stop', '--time', '10', name);
  const stopped = JSON.parse(
    docker('inspect', '--format', '{{json .State}}', name),
  );
  assert.equal(stopped.ExitCode, 0);
  console.log(
    'Disposable container smoke passed: actual SSR/assets, healthy immutable revision, UID1000, read-only/cap-drop, loopback and SIGTERM.',
  );
} finally {
  if (created) docker('rm', '-f', name);
  if (built) docker('image', 'rm', image);
}
