import { deleteExpiredStudioMedia } from '@/studio/r2-retention';
import { authorizeStudioScheduler } from '@/studio/scheduler-auth';

export const maxDuration = 300;

export async function GET(request: Request) {
  const rejection = authorizeStudioScheduler(request);
  if (rejection) return rejection;
  return Response.json(await deleteExpiredStudioMedia(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
