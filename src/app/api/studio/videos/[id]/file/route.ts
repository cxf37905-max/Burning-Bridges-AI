import { getStudioUser } from '@/studio/auth';
import { getOwnedVideo, VideoRequestError } from '@/studio/video-jobs';
import { videoHasExpired } from '@/studio/media-retention';
import {
  getStoredVideoUrl,
  StoredVideoUnavailableError,
} from '@/studio/r2-storage';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const user = await getStudioUser();
  if (!user)
    return Response.json(
      { error: 'Sign in to view your video.' },
      { status: 401, headers }
    );
  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id))
    return Response.json(
      { error: 'Invalid studio video ID.' },
      { status: 400, headers }
    );
  try {
    const video = await getOwnedVideo(id, user.id);
    if (video.status !== 'succeeded' || !video.videoUrl)
      return Response.json(
        { error: 'This video is not ready.' },
        { status: 409, headers }
      );
    if (videoHasExpired(video.updatedAt))
      return Response.json(
        { error: 'This video has expired after 14 days.' },
        { status: 410, headers }
      );
    return new Response(null, {
      status: 307,
      headers: { ...headers, Location: await getStoredVideoUrl(id) },
    });
  } catch (reason) {
    if (reason instanceof VideoRequestError)
      return Response.json(
        { error: reason.message },
        { status: reason.status, headers }
      );
    if (reason instanceof StoredVideoUnavailableError)
      return Response.json({ error: reason.message }, { status: 410, headers });
    throw reason;
  }
}
