import { createFileRoute, useLocation } from '@tanstack/react-router';
import { RoomEntry } from '../workspace/RoomEntry';
import { Workspace } from '../workspace/Workspace';
export const Route = createFileRoute('/')({ component: EntryRoute });
function EntryRoute() {
  const search = useLocation({ select: (location) => location.searchStr });
  return new URLSearchParams(search).has('session') ? (
    <Workspace />
  ) : (
    <RoomEntry />
  );
}
