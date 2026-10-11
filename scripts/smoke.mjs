import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const output = execFileSync(process.execPath, ['dist/cli.js', '--demo'], {
  encoding: 'utf8',
});
const plan = JSON.parse(output);
assert.deepEqual(plan.production.imports, [
  { itemId: 'example:ore', rate: '45' },
]);
assert.equal(plan.layout.floors.length, 3);
assert.equal(plan.layout.liftCorridors.length, 2);
console.log('Compiled planner smoke passed');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = await import(
  '@modelcontextprotocol/sdk/client/stdio.js'
);
const client = new Client({ name: 'compiled-smoke', version: '1.0.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: ['dist/adapters/stdio.js'],
    stderr: 'pipe',
  }),
);
try {
  const room = await client.callTool({
    name: 'read_room',
    arguments: { roomId: 'local' },
  });
  assert.equal(room.isError, false);
  assert.equal(room.structuredContent.data.revision, 0);
  console.log('Compiled MCP smoke passed');
} finally {
  await client.close();
}
