import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, mkdtemp, rm, appendFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'satispire-artifact-test-'));
const output = join(directory, 'bundle');
try {
  const reject = (env, message) => {
    assert.throws(
      () =>
        execFileSync('node', ['scripts/container-smoke.mjs'], {
          env: { ...process.env, SATISPIRE_ARTIFACT_DIR: output, ...env },
          stdio: 'pipe',
        }),
      (error) =>
        error.status !== 0 && error.stderr.toString().includes(message),
    );
  };
  reject(
    { APP_REVISION: '0'.repeat(40) },
    'Artifact revision must match checkout',
  );
  const probe = join(
    process.cwd(),
    'artifact-untracked-' + directory.split('/').at(-1),
  );
  await writeFile(probe, 'DISPOSABLE_ARTIFACT_SENTINEL', { flag: 'wx' });
  try {
    reject({}, 'Artifact requires a clean checkout');
  } finally {
    await rm(probe);
  }
  const child = spawn('node', ['scripts/container-smoke.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, SATISPIRE_ARTIFACT_DIR: output },
  });
  assert.equal(await new Promise((resolve) => child.once('exit', resolve)), 0);
  const manifest = JSON.parse(
    await readFile(join(output, 'manifest.json'), 'utf8'),
  );
  assert.equal(manifest.revision, process.env.APP_REVISION);
  assert.match(manifest.imageId, /^sha256:[a-f0-9]{64}$/);
  assert.equal(manifest.archive.file, 'image.tar');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(output, 'image.tar')))
    hash.update(chunk);
  assert.equal(hash.digest('hex'), manifest.archive.sha256);
  const sums = await readFile(join(output, 'SHA256SUMS'), 'utf8');
  assert(sums.includes(`${manifest.archive.sha256}  image.tar`));
  assert(
    sums.includes(
      `${createHash('sha256')
        .update(await readFile(join(output, 'manifest.json')))
        .digest('hex')}  manifest.json`,
    ),
  );
  assert.match(
    await readFile(join(output, 'compose.test.yml'), 'utf8'),
    /127\.0\.0\.1/,
  );
  assert.match(
    await readFile(join(output, 'compose.artifact.yml'), 'utf8'),
    /pull_policy: never/,
  );
  execFileSync('sha256sum', ['-c', 'SHA256SUMS'], { cwd: output });
  await appendFile(join(output, 'image.tar'), 'DISPOSABLE_CORRUPTION');
  assert.throws(() =>
    execFileSync('sha256sum', ['-c', 'SHA256SUMS'], {
      cwd: output,
      stdio: 'pipe',
    }),
  );
  console.log(
    'Artifact regression passed: saved/loaded image identity, archive checksum, commit binding and offline Compose.',
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
