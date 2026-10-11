import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp.js';
import { createLocalApplication } from '../application.js';
import { createRoom } from '../domain/rooms.js';
import { syntheticCatalog } from '../domain/catalog.js';
// Local stdio client owns this process. No network or persistent online room authority is granted.
const room = createRoom({
  roomId: 'local',
  ownerId: 'local-owner',
  ownerName: 'Local planner',
});
const app = createLocalApplication(
  room,
  { roomId: 'local', participantId: 'local-owner' },
  syntheticCatalog,
);
await createMcpServer(app.execute).connect(new StdioServerTransport());
