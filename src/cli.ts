import { readFile } from 'node:fs/promises';
import { syntheticCatalog, validateCatalog } from './domain/catalog.js';
import { buildPlanDocument } from './planning.js';
const demo = {
  schemaVersion: 1,
  production: {
    targets: [
      { itemId: 'example:plate', rate: '20' },
      { itemId: 'example:rod', rate: '15' },
    ],
    recipes: {
      'example:ingot': 'example:smelt',
      'example:plate': 'example:press',
      'example:rod': 'example:shape',
    },
    imports: ['example:ore'],
  },
  layout: { footprint: { width: 32, depth: 32 }, floorHeight: 8, rows: 2 },
};
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log(
      'Usage: npm run plan -- --demo | --input plan.json [--catalog local-catalog.json]\nThe built-in catalog and geometry are original synthetic examples.',
    );
    return;
  }
  let input: unknown;
  let catalog = syntheticCatalog;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--demo') input = demo;
    else if (flag === '--input' || flag === '--catalog') {
      const path = args[++i];
      if (!path) throw new Error(`${flag} requires a file path`);
      const file = await readFile(path, 'utf8');
      if (file.length > 8_000_000) throw new Error('Input exceeds 8 MB limit');
      const data: unknown = JSON.parse(file);
      if (flag === '--catalog') catalog = validateCatalog(data);
      else input = data;
    } else throw new Error(`Unknown argument: ${flag}`);
  }
  if (input === undefined) throw new Error('Choose --demo or --input');
  console.log(JSON.stringify(buildPlanDocument(input, catalog), null, 2));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Planning failed');
  process.exitCode = 1;
});
