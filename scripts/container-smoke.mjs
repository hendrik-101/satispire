import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { readFile, writeFile, rm, mkdir, copyFile } from 'node:fs/promises';
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
const artifactDirectory = process.env.SATISPIRE_ARTIFACT_DIR
  ? resolve(process.env.SATISPIRE_ARTIFACT_DIR)
  : undefined;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
if (artifactDirectory) {
  assert.equal(
    git('rev-parse', 'HEAD'),
    revision,
    'Artifact revision must match checkout',
  );
  assert.equal(
    git('status', '--porcelain'),
    '',
    'Artifact requires a clean checkout',
  );
}
const hashFile = async (path) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};
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
  created = false,
  contextBuilt = false,
  artifactOwned = false,
  artifactComplete = false;
let artifactImage;
const probeName = `.env.satispire-smoke-${id}`;
const probes = [probeName, `web/${probeName}`];
const contextImage = `satispire-context-smoke:${id}`;
const ownedProbes = [];
try {
  for (const path of probes) {
    await writeFile(path, 'DISPOSABLE_CONTEXT_SENTINEL', { flag: 'wx' });
    ownedProbes.push(path);
  }
  const probeBuild = spawn(
    'docker',
    [
      'build',
      ...(process.env.NODE_EXTRA_CA_CERTS
        ? ['--secret', `id=build_ca,src=${process.env.NODE_EXTRA_CA_CERTS}`]
        : []),
      '--build-arg',
      `APP_REVISION=${revision}`,
      '--target',
      'build',
      '-t',
      contextImage,
      '.',
    ],
    { stdio: 'inherit' },
  );
  assert.equal(
    await new Promise((resolve) => probeBuild.once('exit', resolve)),
    0,
  );
  contextBuilt = true;
  docker(
    'run',
    '--rm',
    contextImage,
    'node',
    '-e',
    `const fs=require('node:fs'); if (${JSON.stringify(probes)}.some(p=>fs.existsSync(p))) process.exit(1)`,
  );
  const build = spawn(
    'docker',
    [
      'build',
      ...(process.env.NODE_EXTRA_CA_CERTS
        ? ['--secret', `id=build_ca,src=${process.env.NODE_EXTRA_CA_CERTS}`]
        : []),
      '--build-arg',
      `APP_REVISION=${revision}`,
      '-t',
      image,
      '.',
    ],
    { stdio: 'inherit' },
  );
  const code = await new Promise((resolve) => build.once('exit', resolve));
  assert.equal(code, 0);
  built = true;
  if (artifactDirectory) {
    // Exclusive directory creation: never overwrite an operator's existing bundle.
    await mkdir(artifactDirectory, { mode: 0o700 });
    artifactOwned = true;
    artifactImage = JSON.parse(docker('image', 'inspect', image))[0];
    assert.equal(
      artifactImage.Config.Labels['org.opencontainers.image.revision'],
      revision,
    );
    docker(
      'image',
      'save',
      '--output',
      join(artifactDirectory, 'image.tar'),
      artifactImage.Id,
    );
    docker('image', 'rm', image);
    built = false;
    docker('image', 'load', '--input', join(artifactDirectory, 'image.tar'));
    // Reattach our unique disposable tag; all existing checks run on loaded bytes.
    assert.equal(
      docker('image', 'inspect', '--format', '{{.Id}}', artifactImage.Id),
      artifactImage.Id,
    );
    docker('image', 'tag', artifactImage.Id, image);
    built = true;
  }
  docker(
    'run',
    '-d',
    '--name',
    name,
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--memory=512m',
    '--cpus=1.0',
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
  const policy = JSON.parse(
    docker('inspect', '--format', '{{json .HostConfig}}', name),
  );
  assert.equal(policy.ReadonlyRootfs, true);
  assert.deepEqual(policy.CapDrop, ['ALL']);
  assert(policy.SecurityOpt.includes('no-new-privileges'));
  assert.equal(policy.Memory, 512 * 1024 * 1024);
  assert.equal(policy.NanoCpus, 1000000000);
  docker(
    'exec',
    name,
    'node',
    '-e',
    "if(require('node:fs').existsSync('/run/secrets/build_ca') || process.env.NODE_EXTRA_CA_CERTS) process.exit(1)",
  );
  assert.equal(config.Labels['org.opencontainers.image.revision'], revision);
  assert.equal(docker('exec', name, 'id', '-u'), '1000');
  const notice = await readFile(
    'docs/data/SatisfactoryTools-LICENSE.txt',
    'utf8',
  );
  assert.equal(
    docker(
      'exec',
      name,
      'node',
      '-e',
      "process.stdout.write(require('node:fs').readFileSync('licenses/SatisfactoryTools-LICENSE.txt','utf8'))",
    ),
    notice.trim(),
  );
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
  for (const path of new Set(assets)) {
    const response = await fetch(base + path, {
      headers: { 'Accept-Encoding': 'br' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-encoding'), null);
  }
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  docker('stop', '--time', '10', name);
  const stopped = JSON.parse(
    docker('inspect', '--format', '{{json .State}}', name),
  );
  assert.equal(stopped.ExitCode, 0);
  if (artifactDirectory) {
    const ci = process.env.GITHUB_ACTIONS === 'true';
    const main =
      ci &&
      process.env.GITHUB_EVENT_NAME === 'push' &&
      process.env.GITHUB_REF === 'refs/heads/main';
    if (ci) {
      assert.equal(process.env.GITHUB_REPOSITORY, 'hendrik-101/satispire');
      assert.equal(process.env.GITHUB_SHA, revision);
      assert.match(process.env.GITHUB_RUN_ID ?? '', /^[0-9]+$/);
      assert.match(process.env.GITHUB_RUN_ATTEMPT ?? '', /^[0-9]+$/);
    }
    const manifest = {
      schemaVersion: 1,
      kind: main ? 'main' : ci ? 'candidate' : 'local',
      repository: 'hendrik-101/satispire',
      revision,
      sourceTree: git('rev-parse', 'HEAD^{tree}'),
      imageId: artifactImage.Id,
      platform: {
        os: artifactImage.Os,
        architecture: artifactImage.Architecture,
      },
      archive: {
        file: 'image.tar',
        sha256: await hashFile(join(artifactDirectory, 'image.tar')),
      },
      provenance: ci
        ? {
            event: process.env.GITHUB_EVENT_NAME,
            ref: process.env.GITHUB_REF,
            runId: process.env.GITHUB_RUN_ID,
            runAttempt: process.env.GITHUB_RUN_ATTEMPT,
          }
        : null,
    };
    await writeFile(
      join(artifactDirectory, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      { flag: 'wx' },
    );
    await copyFile(
      'deploy/compose.test.yml',
      join(artifactDirectory, 'compose.test.yml'),
    );
    await copyFile(
      'deploy/compose.artifact.yml',
      join(artifactDirectory, 'compose.artifact.yml'),
    );
    await copyFile(
      'docs/deployment.md',
      join(artifactDirectory, 'DEPLOYMENT.md'),
    );
    const files = [
      'image.tar',
      'manifest.json',
      'compose.test.yml',
      'compose.artifact.yml',
      'DEPLOYMENT.md',
    ];
    const sums = await Promise.all(
      files.map(
        async (file) =>
          `${await hashFile(join(artifactDirectory, file))}  ${file}`,
      ),
    );
    await writeFile(
      join(artifactDirectory, 'SHA256SUMS'),
      sums.join('\n') + '\n',
      { flag: 'wx' },
    );
    artifactComplete = true;
    console.log(
      `Verified runtime bundle: ${artifactDirectory}; source ${revision}; image ${artifactImage.Id}; kind ${manifest.kind}`,
    );
  }
  console.log(
    'Disposable container smoke passed: actual SSR/assets, healthy immutable revision, UID1000, read-only/cap-drop, loopback and SIGTERM.',
  );
} finally {
  if (artifactOwned && !artifactComplete)
    await rm(artifactDirectory, { recursive: true, force: true });
  for (const path of ownedProbes) await rm(path, { force: true });
  if (contextBuilt) docker('image', 'rm', contextImage);
  if (created) docker('rm', '-f', name);
  if (built) docker('image', 'rm', image);
}
