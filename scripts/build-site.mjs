import {
  readFile,
  readdir,
  mkdir,
  writeFile,
  rm,
  cp,
  access,
} from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const root = process.cwd();
const client = join(root, 'web-dist/client');
const app = (
  await import(pathToFileURL(join(root, 'web-dist/server/server.js')).href)
).default;
const assets = {};
// Each known entry needs its own router hydration state in the immutable export.
for (const [assetPath, renderPath] of [
  ['/', '/'],
  ['/local', '/local'],
  ['/session', '/session'],
  ['/room/:roomId', '/room/00000000-0000-4000-8000-000000000000'],
]) {
  const response = await app.fetch(
    new Request('https://satispire.example' + renderPath),
  );
  if (response.status !== 200)
    throw new Error('Workspace export failed: ' + assetPath);
  const html = await response.text();
  if (!html.includes('Satispire'))
    throw new Error('Workspace missing from export: ' + assetPath);
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g))
    await access(join(client, match[1]));
  assets[assetPath] = { body: html, contentType: 'text/html; charset=utf-8' };
}
const mime = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};
async function collect(directory, prefix) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path, prefix + entry.name + '/');
    else {
      const contentType = mime[extname(entry.name)];
      if (!contentType)
        throw new Error(
          'Unsupported exported asset extension: ' + extname(entry.name),
        );
      assets[prefix + entry.name] = {
        body: await readFile(path, 'utf8'),
        contentType,
      };
    }
  }
}
await collect(join(client, 'assets'), '/assets/');
for (const name of [
  'ProgressionPlanner-LICENSE.txt',
  'SatisfactoryAI-LICENSE.txt',
])
  assets['/' + name] = {
    body: await readFile(join(root, 'docs/data', name), 'utf8'),
    contentType: mime['.txt'],
  };
const output = join(root, 'site-dist');
await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'server'), { recursive: true });
await build({
  stdin: {
    contents: `import { createSitesWorker } from './src/runtime/site-worker.ts'; export default createSitesWorker(${JSON.stringify(assets)});`,
    resolveDir: root,
    sourcefile: 'site-entry.ts',
    loader: 'ts',
  },
  outfile: join(output, 'server/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
});
await mkdir(join(output, 'drizzle'), { recursive: true });
const migrationArg = process.argv.indexOf('--migrations');
if (migrationArg >= 0)
  await cp(resolve(process.argv[migrationArg + 1]), join(output, 'drizzle'), {
    recursive: true,
  });
else {
  await cp(
    join(root, 'deploy/session-migration.sql'),
    join(output, 'drizzle/0000_sessions.sql'),
  );
  await cp(
    join(root, 'deploy/room-migration.sql'),
    join(output, 'drizzle/0001_rooms.sql'),
  );
}
const manifestArg = process.argv.indexOf('--manifest');
if (manifestArg >= 0) {
  const manifest = JSON.parse(
    await readFile(resolve(process.argv[manifestArg + 1]), 'utf8'),
  );
  if (!manifest.project_id || manifest.static || !manifest.d1)
    throw new Error(
      'A Worker Site manifest with its existing identity and D1 binding is required',
    );
  await mkdir(join(output, '.openai'), { recursive: true });
  await writeFile(
    join(output, '.openai/hosting.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
}
console.log(
  `Built Site Worker with ${Object.keys(assets).length} embedded assets in site-dist/server/index.js`,
);
