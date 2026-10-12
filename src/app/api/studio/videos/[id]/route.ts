import { getStudioUser } from '@/studio/auth';
import {
  publicVideoJob,
  refreshStudioVideo,
  VideoRequestError,
} from '@/studio/video-jobs';

export const maxDuration = 120;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getStudioUser();
  if (!user)
    return Response.json(
      { error: 'Sign in to view your video.' },
      { status: 401 }
    );
  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id))
    return Response.json(
      { error: 'Invalid studio video ID.' },
      { status: 400 }
    );
  try {
    return Response.json(
      publicVideoJob(await refreshStudioVideo(id, user.id)),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (reason) {
    if (reason instanceof VideoRequestError)
      return Response.json(
        { error: reason.message },
        { status: reason.status }
      );
    throw reason;
  }
}
