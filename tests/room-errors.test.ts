import { expect, it } from 'vitest';
import { ConvexError } from 'convex/values';
import { roomError } from '../web/workspace/room-client';
it('explains rejected plans separately from transport failures', () => {
  expect(roomError(new ConvexError({ code: 'invalid-plan' }))).toContain(
    'Plan',
  );
  expect(roomError(new ConvexError({ code: 'plan-too-large' }))).toContain(
    'Größenlimit',
  );
  expect(roomError(new ConvexError({ code: 'undo-conflict' }))).toContain(
    'späterer Änderungen',
  );
  expect(roomError(new Error('private secret text'))).not.toContain(
    'private secret text',
  );
});
