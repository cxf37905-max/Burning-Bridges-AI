import { getStudioUser } from '@/studio/auth';
import { getOwnedVideo, VideoRequestError } from '@/studio/video-jobs';
import { videoHasExpired } from '@/studio/media-retention';
import {
  getStoredVideoUrl,
  StoredVideoUnavailableError,
} from '@/studio/r2-storage';

export const maxDuration = 120;

export async function GET(
  request: Request,
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
    const address = await getStoredVideoUrl(id);
    if (new URL(request.url).searchParams.get('download') === '1') {
      // 同源流式下载避免浏览器跨域限制，鉴权及文件归属检查沿用上方流程。
      const response = await fetch(address, {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok || !response.body)
        return Response.json(
          { error: 'This video could not be downloaded. Please try again.' },
          { status: response.status === 404 ? 410 : 502, headers }
        );
      const downloadHeaders = new Headers({
        ...headers,
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="burning-bridges-ai-${id}.mp4"`,
        'X-Content-Type-Options': 'nosniff',
      });
      const length = response.headers.get('content-length');
      if (length && /^\d+$/.test(length)) downloadHeaders.set('Content-Length', length);
      return new Response(response.body, { headers: downloadHeaders });
    }
    return new Response(null, {
      status: 307,
      headers: { ...headers, Location: address },
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
