import { createFileRoute } from '@tanstack/react-router';
import { Workspace } from '../workspace/Workspace';
export const Route = createFileRoute('/local')({ component: Workspace });
