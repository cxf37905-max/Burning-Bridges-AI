import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { advanceKlingPipeline, createKlingPipeline, klingStepRequest, returnableVideoCreditEvidence, type KlingPipelineIO } from '../../src/studio/kling-pipeline';
import { type FalFailure } from '../../src/studio/fal-contract';

function harness() {
  const pipeline = createKlingPipeline('https://photos.example/subject.jpg', 'chandelier', 'standard', { referenceVideoUrl: 'https://references.example/full-15s.mp4' });
  const submit = vi.fn(async () => randomUUID());
  const read = vi.fn<KlingPipelineIO['read']>(async () => ({ ready: false }));
  const finishSingle = vi.fn(async () => 'https://results.example/finished.mp4');
  const persist = vi.fn(async () => {});
  const io: KlingPipelineIO = { submit, read, finishSingle, persist, getTaskFailure: (reason) => (reason as { failure?: FalFailure }).failure ?? null };
  return { pipeline, io, submit, read, finishSingle };
}

describe('单次15秒生成状态', () => {
  it('重复推进只提交一次，主体使用角色元素', async () => {
    const { pipeline, io, submit } = harness();
    await advanceKlingPipeline(pipeline, io);
    await advanceKlingPipeline(pipeline, io);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(klingStepRequest(pipeline, 'segment-1')?.input).toEqual({
      prompt: 'Replace the main character in @Video1 with @Element1.',
      video_url: 'https://references.example/full-15s.mp4',
      elements: [{ frontal_image_url: 'https://photos.example/subject.jpg' }],
      keep_audio: false,
    });
  });
  it('提交结果未知时不重复生成、不返还积分', async () => {
    const { pipeline, io, submit } = harness();
    submit.mockRejectedValueOnce(new TypeError('timeout'));
    await advanceKlingPipeline(pipeline, io);
    await advanceKlingPipeline(pipeline, io);
    expect(pipeline.steps[0].state).toBe('unknown');
    expect(returnableVideoCreditEvidence(pipeline)).toBeNull();
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('匹配API终态失败返回证据，不再重生成', async () => {
    const { pipeline, io, submit, read } = harness();
    await advanceKlingPipeline(pipeline, io);
    const failure: FalFailure = { endpoint: klingStepRequest(pipeline, 'segment-1')!.endpoint, requestId: pipeline.steps[0].requestId!, source: 'queue-status', status: 'COMPLETED', error: 'generation failed' };
    read.mockRejectedValueOnce({ failure });
    await advanceKlingPipeline(pipeline, io);
    await advanceKlingPipeline(pipeline, io);
    expect(returnableVideoCreditEvidence(pipeline)).toEqual([failure]);
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('不匹配的失败证据不能返还积分', async () => {
    const { pipeline, io, read } = harness();
    await advanceKlingPipeline(pipeline, io);
    read.mockRejectedValueOnce({ failure: { endpoint: klingStepRequest(pipeline, 'segment-1')!.endpoint, requestId: randomUUID(), source: 'queue-status', status: 'COMPLETED', error: 'generation failed' } });
    await expect(advanceKlingPipeline(pipeline, io)).rejects.toThrow('does not match');
    expect(returnableVideoCreditEvidence(pipeline)).toBeNull();
  });
  it('本地后处理失败只重做后处理，不重发模型', async () => {
    const { pipeline, io, submit, read, finishSingle } = harness();
    await advanceKlingPipeline(pipeline, io);
    read.mockResolvedValueOnce({ ready: true, output: { video: { url: 'https://results.example/source.mp4' } } });
    await advanceKlingPipeline(pipeline, io);
    finishSingle.mockRejectedValueOnce(new Error('storage unavailable'));
    await advanceKlingPipeline(pipeline, io);
    expect(pipeline.compositionError).toBe(true);
    expect(returnableVideoCreditEvidence(pipeline)).toBeNull();
    await advanceKlingPipeline(pipeline, io);
    expect(pipeline.videoUrl).toBe('https://results.example/finished.mp4');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(finishSingle).toHaveBeenCalledTimes(2);
  });
});
