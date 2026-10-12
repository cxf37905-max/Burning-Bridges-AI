import { advancePendingVideos } from '@/studio/video-jobs';
import { authorizeStudioScheduler } from '@/studio/scheduler-auth';

export const maxDuration = 120;

export async function GET(request: Request) {
  const rejection = authorizeStudioScheduler(request);
  if (rejection) return rejection;
  const outcome = await advancePendingVideos();
  return Response.json(outcome, {
    status: outcome.failed ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
