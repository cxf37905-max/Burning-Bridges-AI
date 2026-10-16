import { z } from 'zod';
import {
  falFailureSchema,
  falUnsentSubmissionSchema,
  falVideoResult,
  mediaUrl,
  type FalEndpoint,
  type FalFailure,
  type FalUnsentSubmission,
} from './fal-contract';
import { getKlingTemplate, klingScenes } from './kling-templates';

const stepIds = ['segment-1', 'audio'] as const;
type StepId = (typeof stepIds)[number];
const stepSchema = z.object({
  id: z.enum(stepIds),
  state: z.enum(['idle', 'submitting', 'queued', 'done', 'unknown', 'failed']),
  requestId: z.string().uuid().optional(),
  submissionId: z.uuid().optional(),
  notSubmitted: falUnsentSubmissionSchema.optional(),
  output: z.unknown().optional(),
  failures: z.array(falFailureSchema).max(3).default([]),
});
const pipelineFields = {
  sceneId: z.enum(klingScenes),
  tier: z.enum(['standard', 'pro']),
  photoUrl: mediaUrl,
  videoUrl: mediaUrl.optional(),
  failureReason: z.string().optional(),
  compositionError: z.boolean().default(false),
  compositionFailure: z.string().optional(),
};
const singlePipelineSchema = z.object({
  ...pipelineFields,
  version: z.literal(3),
  referenceVideoUrl: mediaUrl,
  steps: z.array(stepSchema).length(2).refine(
    (steps) => steps[0]?.id === 'segment-1' && steps[1]?.id === 'audio',
    'Single video pipeline steps are missing or out of order.'
  ),
});
export const klingPipelineSchema = singlePipelineSchema;
export type KlingPipeline = z.infer<typeof singlePipelineSchema>;
type SegmentStep = KlingPipeline['steps'][number];

export interface KlingPipelineIO {
  persist: (pipeline: KlingPipeline) => Promise<void>;
  submit: (
    endpoint: FalEndpoint,
    input: Record<string, unknown>,
    webhookUrl?: string
  ) => Promise<string>;
  read: (
    endpoint: FalEndpoint,
    requestId: string
  ) => Promise<{ ready: false } | { ready: true; output: unknown }>;
  getTaskFailure: (reason: unknown) => FalFailure | null;
  getUnsentSubmission?: (reason: unknown) => FalUnsentSubmission | null;
  webhookUrl?: (stepId: 'segment-1', submissionId: string) => string;
  finishSingle: (video: string, sceneId: string) => Promise<string>;
}

export function createKlingPipeline(
  photoUrl: string,
  sceneId: string,
  tier = 'standard',
  reference?: { referenceVideoUrl: string }
) {
  getKlingTemplate(sceneId);
  return singlePipelineSchema.parse({
    version: 3,
    photoUrl,
    sceneId,
    tier,
    referenceVideoUrl: reference?.referenceVideoUrl,
    steps: ['segment-1', 'audio'].map((id) => ({ id, state: 'idle' })),
  });
}

function completedVideo(pipeline: KlingPipeline, id: StepId) {
  const step = pipeline.steps.find(
    (step) => step.id === id && step.state === 'done'
  );
  return step ? falVideoResult.parse(step.output).video.url : null;
}

export function klingStepRequest(pipeline: KlingPipeline, id: StepId) {
  if (id !== 'segment-1') return null;
  return {
    endpoint:
      `fal-ai/kling-video/o3/${pipeline.tier}/video-to-video/edit` as FalEndpoint,
    input: {
      prompt: 'Replace the main character in @Video1 with @Element1.',
      video_url: pipeline.referenceVideoUrl,
      // 接口要求两个字段；复用同一张真实照片，不伪造其他角度。
      elements: [{
        frontal_image_url: pipeline.photoUrl,
        reference_image_urls: [pipeline.photoUrl],
      }],
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

export function returnableVideoCreditEvidence(
  pipeline: KlingPipeline
): (FalFailure | FalUnsentSubmission)[] | null {
  const step = pipeline.steps[0];
  const request = klingStepRequest(pipeline, step.id)!;
  if (step.state === 'failed' && !step.requestId && step.notSubmitted &&
    step.notSubmitted.endpoint === request.endpoint)
    return [falUnsentSubmissionSchema.parse(step.notSubmitted)];
  const failure = confirmedFailure(pipeline, step);
  return failure ? [failure] : null;
}

async function submitSegment(
  pipeline: KlingPipeline,
  step: SegmentStep,
  io: KlingPipelineIO
) {
  const request = klingStepRequest(pipeline, step.id)!;
  const submissionId = crypto.randomUUID();
  const webhookUrl = io.webhookUrl?.(step.id as 'segment-1', submissionId);
  if (webhookUrl) step.submissionId = submissionId;
  delete step.notSubmitted;
  step.state = 'submitting';
  // 先落库再调用付费接口；中断后绝不自动再次提交。
  await io.persist(pipeline);
  try {
    step.requestId = z
      .string()
      .uuid()
      .parse(await (webhookUrl
        ? io.submit(request.endpoint, request.input, webhookUrl)
        : io.submit(request.endpoint, request.input)));
    step.state = 'queued';
  } catch (reason) {
    const proof = io.getUnsentSubmission?.(reason);
    if (proof) {
      step.notSubmitted = falUnsentSubmissionSchema.parse(proof);
      if (proof.endpoint !== request.endpoint)
        throw new Error('Unsent submission evidence does not match the model endpoint.');
      step.state = 'failed';
      if (returnableVideoCreditEvidence(pipeline))
        pipeline.failureReason = 'This video could not be generated.';
    } else {
      step.state = 'unknown';
    }
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

async function finishGeneratedVideo(
  pipeline: KlingPipeline,
  io: KlingPipelineIO
) {
  const first = completedVideo(pipeline, 'segment-1');
  if (!first) return;
  const finalSteps = pipeline.steps.slice(1);
  finalSteps[0].state = 'submitting';
  await io.persist(pipeline);
  let videoUrl: string;
  try {
    videoUrl = mediaUrl.parse(
      await io.finishSingle(first, pipeline.sceneId)
    );
  } catch (reason) {
    // 本地处理可安全重做；保留模型成功结果，下次调度不重新提交模型。
    finalSteps[0].state = 'idle';
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
  for (const step of finalSteps) {
    step.state = 'done';
    step.output = { video: { url: videoUrl } };
  }
  await io.persist(pipeline);
}

export async function advanceKlingPipeline(
  pipeline: KlingPipeline,
  io: KlingPipelineIO
) {
  klingPipelineSchema.parse(pipeline);
  if (pipeline.videoUrl || pipeline.failureReason) return pipeline;
  const segments = pipeline.steps.slice(0, 1);
  const alreadyComplete = segments.every((step) => step.state === 'done');
  for (const step of segments) {
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
  if (returnableVideoCreditEvidence(pipeline)) {
    pipeline.failureReason = 'This video could not be generated.';
    await io.persist(pipeline);
    return pipeline;
  }
  // 生成查询与本地转码分开推进，给转码保留完整的执行时间。
  if (alreadyComplete) await finishGeneratedVideo(pipeline, io);
  return pipeline;
}

export function klingProgressMessage(pipeline: KlingPipeline) {
  if (pipeline.failureReason) return pipeline.failureReason;
  if (pipeline.videoUrl) return 'Your Burning Bridges AI video is ready.';
  const segments = pipeline.steps.slice(0, 1);
  if (
    pipeline.steps.some((step) => step.state === 'unknown') ||
    segments.some((step) => step.state === 'submitting')
  )
    return 'Submission confirmation is delayed. We are waiting for the generation service. Your credits have not been returned.';
  if (pipeline.compositionError)
    return 'Your video is ready. We are retrying the final processing automatically.';
  return 'Creating your Burning Bridges AI video…';
}
