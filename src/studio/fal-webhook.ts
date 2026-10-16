import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { studioVideo } from '@/db/schema';
import { falFailureSchema, falVideoResult } from './fal-contract';
import { readFalQueueStatus } from './fal';
import { klingPipelineSchema, klingProgressMessage, klingStepRequest } from './kling-pipeline';
import type { FalWebhookContext } from './fal-webhook-url';

export const falWebhookPayload = z.object({
  request_id: z.uuid(),
  gateway_request_id: z.uuid().optional(),
  status: z.enum(['OK', 'ERROR']),
  error: z.string().optional(),
  payload: z.unknown().optional(),
});

export class FalWebhookError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export async function recordFalWebhook(
  context: FalWebhookContext,
  result: z.infer<typeof falWebhookPayload>
) {
  const db = await getDb();
  const owner = randomUUID();
  const [video] = await db.update(studioVideo).set({
    leaseOwner: owner,
    leaseUntil: new Date(Date.now() + 180_000),
  }).where(and(
    eq(studioVideo.id, context.videoId),
    inArray(studioVideo.status, ['reserved', 'processing']),
    isNull(studioVideo.refundedAt),
    or(isNull(studioVideo.leaseUntil), lt(studioVideo.leaseUntil, new Date()))
  )).returning();
  if (!video) {
    const [existing] = await db.select({ status: studioVideo.status })
      .from(studioVideo).where(eq(studioVideo.id, context.videoId));
    if (!existing) throw new FalWebhookError('Generation callback task was not found.', 404);
    if (['succeeded', 'failed'].includes(existing.status)) return false;
    // 不与页面或调度器争写状态；非2xx让fal重新投递同一个回调，不会重新生成。
    throw new FalWebhookError('Generation task is busy. Retry this callback.', 503);
  }
  try {
    const pipeline = klingPipelineSchema.parse(video.klingPipeline);
    const step = pipeline.steps.find((entry) => entry.id === context.stepId);
    if (!step)
      throw new FalWebhookError('Generation callback step does not belong to this task.', 409);
    // 旧提交的迟到回调不能覆盖新的提交。
    if (step.submissionId !== context.submissionId || pipeline.videoUrl) return false;
    if (step.requestId && step.requestId !== result.request_id)
      throw new FalWebhookError('Generation callback request identity does not match.', 409);
    // 已记录结果仍可能没有合成或退款；重复投递应继续本地处理。
    if (step.state === 'done' || step.state === 'failed') return true;
    const request = klingStepRequest(pipeline, step.id)!;
    // 用本项目FAL_KEY再读一次任务，确认归属和终态；不只凭回调链接绑定未知任务。
    const queue = await readFalQueueStatus(request.endpoint, result.request_id);
    if (queue.status !== 'COMPLETED')
      throw new FalWebhookError('Generation callback arrived before the final queue state.', 503);
    step.requestId = result.request_id;
    if (queue.error?.trim() || queue.error_type?.trim()) {
      step.failures.push(falFailureSchema.parse({
        endpoint: request.endpoint, requestId: result.request_id,
        source: 'queue-status', status: 'COMPLETED',
        error: queue.error, errorType: queue.error_type,
      }));
      step.state = 'failed';
    } else if (result.status === 'ERROR' && result.error?.trim()) {
      step.failures.push(falFailureSchema.parse({
        endpoint: request.endpoint, requestId: result.request_id,
        source: 'webhook', status: 'ERROR', error: result.error,
      }));
      step.state = 'failed';
    } else {
      const output = result.status === 'OK'
        ? falVideoResult.safeParse(result.payload)
        : null;
      step.state = output?.success ? 'done' : 'queued';
      if (output?.success) step.output = output.data;
      // 缺少输出地址不是失败证据；已恢复ID，后续查询同一个任务。
    }
    const savedPipeline = klingPipelineSchema.parse(pipeline);
    const [saved] = await db.update(studioVideo).set({
      klingPipeline: savedPipeline,
      status: 'processing',
      failureReason: klingProgressMessage(savedPipeline),
      updatedAt: new Date(),
    }).where(and(
      eq(studioVideo.id, context.videoId),
      eq(studioVideo.leaseOwner, owner)
    )).returning({ id: studioVideo.id });
    if (!saved) throw new FalWebhookError('Generation callback lost its task lease.', 503);
    return true;
  } finally {
    await db.update(studioVideo).set({ leaseOwner: null, leaseUntil: null })
      .where(and(eq(studioVideo.id, context.videoId), eq(studioVideo.leaseOwner, owner)));
  }
}
