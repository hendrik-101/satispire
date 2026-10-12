import { readBoundedUtf8File } from '../src/bounded-file.js';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { convertDiscovery } from '../src/discovery.js';
const [directory, destination] = process.argv.slice(2);
if (!directory || !destination)
  throw new Error(
    'Usage: npm run import:discovery -- DISCOVERY_DIRECTORY PRIVATE_CATALOG_JSON',
  );
const receipt = destination + '.diagnostics.json';
if (existsSync(destination) || existsSync(receipt))
  throw new Error(
    'Use fresh private output paths; existing files are preserved.',
  );
const bundle = Object.fromEntries(
  await Promise.all(
    ['manifest', 'items', 'recipes', 'buildings'].map(async (name) => [
      name,
      JSON.parse(
        await readBoundedUtf8File(join(directory, name + '.json')),
      ) as unknown,
    ]),
  ),
);
const result = convertDiscovery(bundle);
writeFileSync(destination, JSON.stringify(result.catalog, null, 2) + '\n', {
  flag: 'wx',
});
writeFileSync(
  receipt,
  JSON.stringify(
    { details: result.details, excluded: result.excluded },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
console.log(
  JSON.stringify({
    recipes: result.catalog.recipes.length,
    excluded: result.excluded.length,
    provenance: result.catalog.provenance.kind,
    geometry: 'unknown',
  }),
);
