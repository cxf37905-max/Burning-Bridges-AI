import 'server-only';
import { and, desc, eq, gte, inArray, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { studioVideo } from '@/db/schema';
import { videoRetentionSeconds } from './media-retention';
import { publicVideoJob } from './public-video-job';

export async function readCurrentStudioVideo(userId: string) {
  const db = await getDb();
  const [video] = await db
    .select({
      id: studioVideo.id,
      sceneId: studioVideo.sceneId,
      status: studioVideo.status,
      videoUrl: studioVideo.videoUrl,
      updatedAt: studioVideo.updatedAt,
      failureReason: studioVideo.failureReason,
      refundedAt: studioVideo.refundedAt,
    })
    .from(studioVideo)
    .where(
      and(
        eq(studioVideo.userId, userId),
        or(
          inArray(studioVideo.status, ['reserved', 'processing']),
          gte(
            studioVideo.updatedAt,
            new Date(Date.now() - videoRetentionSeconds * 1000)
          )
        )
      )
    )
    .orderBy(desc(studioVideo.createdAt))
    .limit(1);
  return video ? publicVideoJob(video) : null;
}
