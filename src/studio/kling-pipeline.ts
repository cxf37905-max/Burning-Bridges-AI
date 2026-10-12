import { z } from 'zod';
import {
  falFailureSchema,
  falVideoResult,
  mediaUrl,
  type FalEndpoint,
  type FalFailure,
} from './fal-contract';
import { getKlingTemplate, klingScenes } from './kling-templates';

const stepIds = ['segment-1', 'segment-2', 'merge', 'audio'] as const;
type StepId = (typeof stepIds)[number];
const stepSchema = z.object({
  id: z.enum(stepIds),
  state: z.enum(['idle', 'submitting', 'queued', 'done', 'unknown', 'failed']),
  requestId: z.string().uuid().optional(),
  output: z.unknown().optional(),
  failures: z.array(falFailureSchema).max(3).default([]),
});
const pipelineFields = {
  sceneId: z.enum(klingScenes),
  tier: z.enum(['standard', 'pro']),
  photoUrl: mediaUrl,
  videoUrl: mediaUrl.optional(),
  failureReason: z.string().optional(),
  // 保留旧字段，旧版单段失败证据不能直接触发新规则退款。
  falFailure: falFailureSchema.optional(),
  compositionError: z.boolean().default(false),
  compositionFailure: z.string().optional(),
};
const currentPipelineSchema = z.object({
  ...pipelineFields,
  version: z.literal(2),
  steps: z
    .array(stepSchema)
    .length(4)
    .refine(
      (steps) => steps.every((step, index) => step.id === stepIds[index]),
      'Pipeline steps are missing, duplicated, or out of order.'
    ),
});
const legacyStepIds = [
  'segment-1',
  'segment-2',
  'inspect-1',
  'inspect-2',
  'merge',
  'audio',
  'verify',
] as const;
const legacyPipelineSchema = z
  .object({
    ...pipelineFields,
    version: z.literal(1),
    steps: z
      .array(stepSchema.extend({ id: z.enum(legacyStepIds) }))
      .length(7)
      .refine((steps) =>
        steps.every((step, index) => step.id === legacyStepIds[index])
      ),
  })
  .transform((legacy) =>
    currentPipelineSchema.parse({
      ...legacy,
      version: 2,
      steps: legacy.steps.filter((step) =>
        (stepIds as readonly string[]).includes(step.id)
      ),
    })
  );
export const klingPipelineSchema = z.union([
  currentPipelineSchema,
  legacyPipelineSchema,
]);
export type KlingPipeline = z.infer<typeof currentPipelineSchema>;
type SegmentStep = KlingPipeline['steps'][number];

export interface KlingPipelineIO {
  persist: (pipeline: KlingPipeline) => Promise<void>;
  submit: (
    endpoint: FalEndpoint,
    input: Record<string, unknown>
  ) => Promise<string>;
  read: (
    endpoint: FalEndpoint,
    requestId: string
  ) => Promise<{ ready: false } | { ready: true; output: unknown }>;
  getTaskFailure: (reason: unknown) => FalFailure | null;
  compose: (first: string, second: string, sceneId: string) => Promise<string>;
}

export function createKlingPipeline(
  photoUrl: string,
  sceneId: string,
  tier = 'standard'
) {
  getKlingTemplate(sceneId);
  return klingPipelineSchema.parse({
    version: 2,
    photoUrl,
    sceneId,
    tier,
    steps: stepIds.map((id) => ({ id, state: 'idle' })),
  });
}

function completedVideo(pipeline: KlingPipeline, id: StepId) {
  const step = pipeline.steps.find(
    (step) => step.id === id && step.state === 'done'
  );
  return step ? falVideoResult.parse(step.output).video.url : null;
}

export function klingStepRequest(pipeline: KlingPipeline, id: StepId) {
  if (id !== 'segment-1' && id !== 'segment-2') return null;
  const template = getKlingTemplate(pipeline.sceneId);
  return {
    endpoint:
      `fal-ai/kling-video/o3/${pipeline.tier}/video-to-video/edit` as FalEndpoint,
    input: {
      prompt:
        'In @Video1 replace only the main foreground performer with the person in @Image1. Preserve the reference photo facial identity, hairstyle and body proportions. Keep the original video outfit unchanged, including its exact colors and accessories. Preserve all original actions, expressions, timing, camera movement, lighting, background and other people. Maintain the same person throughout. Do not add text, cuts, new motion or new objects.',
      video_url: template.segments[id === 'segment-1' ? 0 : 1].url,
      image_urls: [pipeline.photoUrl],
      keep_audio: false,
    },
  };
}

function confirmedFailure(pipeline: KlingPipeline, step: SegmentStep) {
  const failure = step.failures.at(-1);
  const request = klingStepRequest(pipeline, step.id);
  return step.state === 'failed' &&
    request &&
    failure &&
    failure.requestId === step.requestId &&
    failure.endpoint === request.endpoint
    ? falFailureSchema.parse(failure)
    : null;
}

export function refundableSegmentFailures(
  pipeline: KlingPipeline
): FalFailure[] | null {
  const first = confirmedFailure(pipeline, pipeline.steps[0]);
  const second = confirmedFailure(pipeline, pipeline.steps[1]);
  if (first && second) return [first, second];
  const failed = pipeline.steps
    .slice(0, 2)
    .find((step) => confirmedFailure(pipeline, step));
  if (
    !failed ||
    failed.failures.length !== 3 ||
    !pipeline.steps.slice(0, 2).some((step) => step.state === 'done')
  )
    return null;
  const request = klingStepRequest(pipeline, failed.id)!;
  const failures = failed.failures.map((failure) =>
    falFailureSchema.parse(failure)
  );
  if (
    failures.some((failure) => failure.endpoint !== request.endpoint) ||
    new Set(failures.map((failure) => failure.requestId)).size !== 3
  )
    return null;
  return failures;
}

async function submitSegment(
  pipeline: KlingPipeline,
  step: SegmentStep,
  io: KlingPipelineIO
) {
  const request = klingStepRequest(pipeline, step.id)!;
  step.state = 'submitting';
  // 先落库再调用付费接口；中断后绝不自动再次提交。
  await io.persist(pipeline);
  try {
    step.requestId = z
      .string()
      .uuid()
      .parse(await io.submit(request.endpoint, request.input));
    step.state = 'queued';
  } catch {
    step.state = 'unknown';
    await io.persist(pipeline);
    return false;
  }
  await io.persist(pipeline);
  return true;
}

async function querySegment(
  pipeline: KlingPipeline,
  step: SegmentStep,
  io: KlingPipelineIO
) {
  if (!step.requestId)
    throw new Error(`Queued step ${step.id} has no request identity.`);
  const request = klingStepRequest(pipeline, step.id)!;
  let result: Awaited<ReturnType<KlingPipelineIO['read']>>;
  try {
    result = await io.read(request.endpoint, step.requestId);
  } catch (reason) {
    const failure = io.getTaskFailure(reason);
    if (!failure) throw reason;
    falFailureSchema.parse(failure);
    if (
      failure.requestId !== step.requestId ||
      failure.endpoint !== request.endpoint
    )
      throw new Error(
        `Failed fal task does not match step ${step.id}: ${failure.requestId}`
      );
    step.failures.push(failure);
    step.state = 'failed';
    await io.persist(pipeline);
    return;
  }
  if (!result.ready) return;
  // 只解析视频地址，不检查成片时长、画面或音频质量。
  step.output = falVideoResult.parse(result.output);
  step.state = 'done';
  await io.persist(pipeline);
}

async function retryFailedSegment(
  pipeline: KlingPipeline,
  io: KlingPipelineIO
) {
  const segments = pipeline.steps.slice(0, 2);
  if (!segments.some((step) => step.state === 'done')) return;
  const failed = segments.find((step) => confirmedFailure(pipeline, step));
  if (!failed || failed.failures.length >= 3) return;
  // 首次失败后最多再提交两次；每次必须先有对应 request_id 的最终失败证据。
  delete failed.requestId;
  await submitSegment(pipeline, failed, io);
}

async function composeCompletedSegments(
  pipeline: KlingPipeline,
  io: KlingPipelineIO
) {
  const first = completedVideo(pipeline, 'segment-1');
  const second = completedVideo(pipeline, 'segment-2');
  if (!first || !second) return;
  // 旧版远程合成保留身份，需人工核对，不能静默重复付费。
  if (
    pipeline.steps
      .slice(2)
      .some((step) => step.requestId && step.state !== 'done')
  )
    return;
  pipeline.steps[2].state = 'submitting';
  await io.persist(pipeline);
  let videoUrl: string;
  try {
    videoUrl = mediaUrl.parse(
      await io.compose(first, second, pipeline.sceneId)
    );
  } catch (reason) {
    // 本地合成可安全重做；保留两段成功结果，下次调度仅重试合成。
    pipeline.steps[2].state = 'idle';
    pipeline.compositionError = true;
    pipeline.compositionFailure =
      reason instanceof Error
        ? reason.message
        : 'Unknown local composition failure.';
    await io.persist(pipeline);
    return;
  }
  pipeline.videoUrl = videoUrl;
  pipeline.compositionError = false;
  delete pipeline.compositionFailure;
  for (const step of pipeline.steps.slice(2)) {
    step.state = 'done';
    step.output = { video: { url: videoUrl } };
  }
  await io.persist(pipeline);
}

export async function advanceKlingPipeline(
  pipeline: KlingPipeline,
  io: KlingPipelineIO
) {
  currentPipelineSchema.parse(pipeline);
  if (pipeline.videoUrl || pipeline.failureReason) return pipeline;
  const alreadyComplete = pipeline.steps
    .slice(0, 2)
    .every((step) => step.state === 'done');
  for (const step of pipeline.steps.slice(0, 2)) {
    if (step.state === 'submitting') {
      step.state = 'unknown';
      await io.persist(pipeline);
      return pipeline;
    }
    if (step.state === 'unknown') return pipeline;
    if (step.state === 'idle') {
      if (!(await submitSegment(pipeline, step, io))) return pipeline;
    } else if (step.state === 'queued') {
      await querySegment(pipeline, step, io);
    }
  }
  if (refundableSegmentFailures(pipeline)) {
    pipeline.failureReason = 'This video could not be generated.';
    await io.persist(pipeline);
    return pipeline;
  }
  await retryFailedSegment(pipeline, io);
  // 生成查询与本地转码分开推进，给转码保留完整的执行时间。
  if (alreadyComplete) await composeCompletedSegments(pipeline, io);
  return pipeline;
}

export function klingProgressMessage(pipeline: KlingPipeline) {
  if (pipeline.failureReason) return pipeline.failureReason;
  if (pipeline.videoUrl) return 'Your Burning Bridges AI video is ready.';
  if (
    pipeline.steps.some((step) => step.state === 'unknown') ||
    pipeline.steps.slice(0, 2).some((step) => step.state === 'submitting')
  )
    return 'We could not confirm this submission. Your credits have not been returned. Please contact support before starting it again.';
  if (
    pipeline.steps
      .slice(2)
      .some((step) => step.requestId && step.state !== 'done')
  )
    return 'This earlier take needs support to confirm its final processing status. Your credits have not been returned.';
  if (pipeline.compositionError)
    return 'Your video parts are ready. We are retrying the final assembly automatically.';
  if (pipeline.steps.slice(0, 2).every((step) => step.state === 'done'))
    return 'Putting your video together and adding the original song…';
  if (pipeline.steps.slice(0, 2).some((step) => step.failures.length > 0))
    return pipeline.steps.slice(0, 2).some((step) => step.state === 'done')
      ? 'We are keeping your completed part and retrying only the failed part.'
      : 'Waiting for the remaining part to finish…';
  return 'Creating your Burning Bridges AI video…';
}
