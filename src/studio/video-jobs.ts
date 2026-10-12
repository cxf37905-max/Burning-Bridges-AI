import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { getBaseUrl } from '@/lib/urls';
import { videoExpiresAt, videoHasExpired } from './media-retention';
import { studioVideo } from '@/db/schema';
import {
  consumeCreditsInTransaction,
  getUserCredits,
  refundVideoCreditsInTransaction,
  InsufficientCreditsError,
} from '@/credits/credits';
import { videoCreditCost } from './catalog';
import { storeStudioPhoto } from './photo-storage';
import { getKlingTemplate } from './kling-templates';
import { composeStudioVideo } from './video-storage';
import {
  advanceKlingPipeline,
  createKlingPipeline,
  klingPipelineSchema,
  klingProgressMessage,
  refundableSegmentFailures,
  type KlingPipeline,
} from './kling-pipeline';
import {
  FalRequestError,
  FalTaskFailedError,
  readFalTask,
  submitFalTask,
} from './fal';

export class VideoRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'VideoRequestError';
  }
}

export async function getOwnedVideo(id: string, userId: string) {
  const db = await getDb();
  const [video] = await db
    .select()
    .from(studioVideo)
    .where(and(eq(studioVideo.id, id), eq(studioVideo.userId, userId)));
  if (!video)
    throw new VideoRequestError(
      'This video was not found in your studio.',
      404
    );
  return video;
}

async function refundFailedVideo(
  id: string,
  pipeline: KlingPipeline,
  leaseOwner: string
) {
  if (!refundableSegmentFailures(pipeline))
    throw new Error(
      `Video ${id} has no confirmed refundable segment failures.`
    );
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(studioVideo)
      .set({
        status: 'failed',
        failureReason:
          'This video could not be generated. Your 100 credits have been returned to your balance.',
        refundedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(studioVideo.id, id),
          eq(studioVideo.leaseOwner, leaseOwner),
          inArray(studioVideo.status, ['reserved', 'processing']),
          isNull(studioVideo.refundedAt),
          sql`${studioVideo.klingPipeline} = ${JSON.stringify(pipeline)}::jsonb`
        )
      )
      .returning();
    if (claimed) {
      await refundVideoCreditsInTransaction(tx, {
        userId: claimed.userId,
        videoId: id,
      });
    }
  });
}

async function advanceOwnedVideo(id: string, userId: string, picture?: Buffer) {
  const db = await getDb();
  const owner = randomUUID();
  const [video] = await db
    .update(studioVideo)
    .set({
      leaseOwner: owner,
      leaseUntil: new Date(Date.now() + 180_000),
    })
    .where(
      and(
        eq(studioVideo.id, id),
        eq(studioVideo.userId, userId),
        inArray(studioVideo.status, ['reserved', 'processing']),
        or(
          isNull(studioVideo.leaseUntil),
          lt(studioVideo.leaseUntil, new Date())
        )
      )
    )
    .returning();
  if (!video) return;
  let pipeline: KlingPipeline | null = video.klingPipeline;
  const persist = async (next: KlingPipeline) => {
    const [saved] = await db
      .update(studioVideo)
      .set({
        klingPipeline: next,
        status: next.videoUrl ? 'succeeded' : 'processing',
        videoUrl: next.videoUrl ?? null,
        failureReason: next.videoUrl ? null : klingProgressMessage(next),
        updatedAt: new Date(),
      })
      .where(and(eq(studioVideo.id, id), eq(studioVideo.leaseOwner, owner)))
      .returning({ id: studioVideo.id });
    if (!saved) throw new Error(`Video lease was lost: ${id}`);
  };
  try {
    if (!pipeline) {
      // 旧版本的已提交任务不能当作新任务重复收费。
      if (video.requestBody || video.providerTaskId)
        throw new VideoRequestError(
          'This older take needs manual review before it can continue.',
          409
        );
      if (!picture) {
        return;
      }
      const photoUrl = await storeStudioPhoto(id, picture);
      pipeline = createKlingPipeline(
        photoUrl,
        video.sceneId,
        process.env.STUDIO_KLING_TIER || 'standard'
      );
      await persist(pipeline);
    } else {
      pipeline = klingPipelineSchema.parse(pipeline);
    }
    await advanceKlingPipeline(pipeline, {
      persist,
      submit: submitFalTask,
      read: readFalTask,
      compose: (first, second, sceneId) =>
        composeStudioVideo(id, first, second, sceneId),
      getTaskFailure: (reason) =>
        reason instanceof FalTaskFailedError ? reason.failure : null,
    });
    if (refundableSegmentFailures(pipeline))
      await refundFailedVideo(id, pipeline, owner);
    else if (pipeline.steps.some((step) => step.state === 'unknown'))
      await persist(pipeline);
  } catch (reason) {
    if (
      reason instanceof FalRequestError ||
      reason instanceof TypeError ||
      reason instanceof DOMException
    ) {
      // 查询失败不意味着生成失败；已保存的上游任务会在下次查询继续。
      await db
        .update(studioVideo)
        .set({
          failureReason:
            'The service could not be reached. Check this take again shortly.',
          updatedAt: new Date(),
        })
        .where(and(eq(studioVideo.id, id), eq(studioVideo.leaseOwner, owner)));
    } else {
      throw reason;
    }
  } finally {
    await db
      .update(studioVideo)
      .set({ leaseOwner: null, leaseUntil: null })
      .where(and(eq(studioVideo.id, id), eq(studioVideo.leaseOwner, owner)));
  }
}

export async function createStudioVideo(
  userId: string,
  requestId: string,
  sceneId: string,
  picture: Buffer
) {
  const template = getKlingTemplate(sceneId);
  const id = createHash('sha256')
    .update(`${userId}:${requestId}`)
    .digest('hex')
    .slice(0, 32);
  const photoHash = createHash('sha256').update(picture).digest('hex');
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(studioVideo)
    .where(and(eq(studioVideo.id, id), eq(studioVideo.userId, userId)));
  if (existing) {
    assertSameVideoRequest(existing, photoHash, sceneId);
    if (existing.status === 'reserved' || existing.status === 'processing')
      await advanceOwnedVideo(id, userId, picture);
    return getOwnedVideo(id, userId);
  }
  if ((await getUserCredits(userId)) < videoCreditCost)
    throw new VideoRequestError(
      'You need 100 credits for this video. Get credits to continue.',
      402
    );
  // 准备失败时还未扣次数、也未调用 fal；照片哈希避免并发请求覆盖不同照片。
  const photoUrl = await storeStudioPhoto(`${id}-${photoHash}`, picture);
  const pipeline = createKlingPipeline(
    photoUrl,
    sceneId,
    process.env.STUDIO_KLING_TIER || 'standard'
  );
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(studioVideo)
      .values({
        id,
        userId,
        sceneId,
        photoHash,
        referenceUrl: template.segments[0].url,
        klingPipeline: pipeline,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) return;
    try {
      await consumeCreditsInTransaction(tx, {
        userId,
        amount: videoCreditCost,
        description: 'Burning Bridges AI video generation',
        idempotencyKey: 'video:' + id,
      });
    } catch (reason) {
      if (!(reason instanceof InsufficientCreditsError)) throw reason;
      throw new VideoRequestError(
        'You need 100 credits for this video. Get credits to continue.',
        402
      );
    }
  });
  const video = await getOwnedVideo(id, userId);
  assertSameVideoRequest(video, photoHash, sceneId);
  if (video.status === 'reserved' || video.status === 'processing')
    await advanceOwnedVideo(id, userId);
  return getOwnedVideo(id, userId);
}

function assertSameVideoRequest(
  video: Awaited<ReturnType<typeof getOwnedVideo>>,
  photoHash: string,
  sceneId: string
) {
  if (video.photoHash !== photoHash || video.sceneId !== sceneId)
    throw new VideoRequestError(
      'This request already belongs to a different photo or scene. Start a new take.',
      409
    );
}

export async function refreshStudioVideo(id: string, userId: string) {
  const video = await getOwnedVideo(id, userId);
  if (Date.now() - video.updatedAt.getTime() >= 8000)
    await advanceOwnedVideo(id, userId);
  return getOwnedVideo(id, userId);
}

// 调度器只推进服务端查到的待处理任务，不接受外部传入的用户或任务身份。
export async function advancePendingVideos() {
  const db = await getDb();
  const pending = await db
    .select({ id: studioVideo.id, userId: studioVideo.userId })
    .from(studioVideo)
    .where(
      and(
        inArray(studioVideo.status, ['reserved', 'processing']),
        or(
          isNull(studioVideo.leaseUntil),
          lt(studioVideo.leaseUntil, new Date())
        )
      )
    )
    .orderBy(asc(studioVideo.updatedAt))
    .limit(2);
  const outcomes = await Promise.allSettled(
    pending.map((video) => advanceOwnedVideo(video.id, video.userId))
  );
  return {
    examined: outcomes.length,
    failed: outcomes.filter((outcome) => outcome.status === 'rejected').length,
  };
}

export function publicVideoJob(
  video: Awaited<ReturnType<typeof getOwnedVideo>>
) {
  const expired =
    video.status === 'succeeded' && videoHasExpired(video.updatedAt);
  return {
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
  };
}
