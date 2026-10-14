import 'server-only';
import type { studioVideo } from '@/db/schema';
import { getBaseUrl } from '@/lib/urls';
import { videoExpiresAt, videoHasExpired } from './media-retention';
import { publicVideoJobSchema } from './video-job-contract';

export function publicVideoJob(
  video: Pick<typeof studioVideo.$inferSelect,
    'id' | 'sceneId' | 'status' | 'videoUrl' | 'updatedAt' | 'failureReason' | 'refundedAt'>
) {
  const expired =
    video.status === 'succeeded' && videoHasExpired(video.updatedAt);
  return publicVideoJobSchema.parse({
    id: video.id,
    sceneId: video.sceneId,
    status: video.status,
    videoUrl:
      video.status === 'succeeded' && video.videoUrl && !expired
        ? new URL(`/api/studio/videos/${video.id}/file`, getBaseUrl()).href
        : null,
    expired,
    expiresAt:
      video.status === 'succeeded'
        ? videoExpiresAt(video.updatedAt).toISOString()
        : null,
    message: video.failureReason,
    refunded: video.refundedAt !== null,
  });
}
