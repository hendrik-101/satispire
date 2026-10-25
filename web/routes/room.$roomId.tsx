import { createFileRoute } from '@tanstack/react-router';
import { RoomWorkspace } from '../workspace/RoomWorkspace';
export const Route = createFileRoute('/room/$roomId')({ component: RoomRoute });
function RoomRoute() {
  const { roomId } = Route.useParams();
  return <RoomWorkspace key={roomId} roomId={roomId} />;
}
