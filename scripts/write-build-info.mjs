import { writeFile } from 'node:fs/promises';
const revision = process.env.APP_REVISION;
if (!revision || !/^[a-f0-9]{40}$/.test(revision))
  throw new Error(
    'APP_REVISION must be the checked-out full lowercase commit SHA',
  );
await writeFile(
  new URL('../web-dist/build-info.json', import.meta.url),
  JSON.stringify({ revision }) + '\n',
);
