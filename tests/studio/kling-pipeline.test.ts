import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  advanceKlingPipeline,
  createKlingPipeline,
  klingPipelineSchema,
  returnableVideoCreditEvidence,
  type KlingPipeline,
  type KlingPipelineIO,
} from '../../src/studio/kling-pipeline';
import { FalTaskFailedError } from '../../src/studio/fal';
import { getKlingTemplate } from '../../src/studio/kling-templates';

function harness(scene = 'chandelier') {
  const pipeline = createKlingPipeline(
    'https://photos.example/person.jpg',
    scene
  );
  const submitted: {
    stepId: string;
    endpoint: string;
    input: Record<string, unknown>;
    requestId: string;
  }[] = [];
  const saved: KlingPipeline[] = [];
  const outputs = new Map<string, unknown>();
  const compose = vi.fn(async () => 'https://results.example/finished.mp4');
  const io: KlingPipelineIO = {
    persist: async (next) => {
      saved.push(structuredClone(next));
    },
    submit: async (endpoint, input) => {
      const stepId = pipeline.steps.find(
        (step) => step.state === 'submitting'
      )!.id;
      expect(
        saved.at(-1)!.steps.find((step) => step.id === stepId)!.state
      ).toBe('submitting');
      const requestId = randomUUID();
      submitted.push({ stepId, endpoint, input, requestId });
      outputs.set(requestId, {
        video: { url: `https://videos.example/${stepId}.mp4` },
      });
      return requestId;
    },
    read: async (_endpoint, requestId) => ({
      ready: true,
      output: outputs.get(requestId),
    }),
    getTaskFailure: (reason) =>
      reason instanceof FalTaskFailedError ? reason.failure : null,
    compose,
  };
  return { pipeline, io, submitted, saved, outputs, compose };
}

function failure(
  endpoint: Parameters<KlingPipelineIO['read']>[0],
  requestId: string
) {
  return new FalTaskFailedError({
    endpoint,
    requestId,
    source: 'queue-status',
    status: 'COMPLETED',
    errorType: 'runner_server_error',
  });
}

describe('两段生成、串行重试与本地合成', () => {
  it.each([
    'chandelier',
    'after-hours',
  ])('%s 只向模型提交两段，随后本地拼接和加音频', async (scene) => {
    const { pipeline, io, submitted, compose } = harness(scene);
    for (let tick = 0; tick < 5; tick++)
      await advanceKlingPipeline(pipeline, io);
    expect(pipeline.videoUrl).toBe('https://results.example/finished.mp4');
    expect(submitted.map((entry) => entry.stepId)).toEqual([
      'segment-1',
      'segment-2',
    ]);
    const template = getKlingTemplate(scene);
    expect(submitted[0].input).toMatchObject({
      image_urls: [pipeline.photoUrl],
      video_url: template.segments[0].url,
      keep_audio: false,
    });
    expect(submitted[1].input.video_url).toBe(template.segments[1].url);
    expect(submitted[1].input.image_urls).toEqual(
      submitted[0].input.image_urls
    );
    expect(submitted[0].input.prompt).toBe(
      'Replace the main character in @Video1 with the main character in @Image1.'
    );
    expect(compose).toHaveBeenCalledExactlyOnceWith(
      'https://videos.example/segment-1.mp4',
      'https://videos.example/segment-2.mp4',
      scene
    );
  });

  it('两段都明确失败才直接退款，不重试任何一段', async () => {
    const { pipeline, io, submitted, compose } = harness();
    await advanceKlingPipeline(pipeline, io);
    io.read = async (endpoint, requestId) => {
      throw failure(endpoint, requestId);
    };
    await advanceKlingPipeline(pipeline, io);
    expect(returnableVideoCreditEvidence(pipeline)).toHaveLength(2);
    expect(pipeline.failureReason).toBeTruthy();
    await advanceKlingPipeline(pipeline, io);
    expect(submitted).toHaveLength(2);
    expect(compose).not.toHaveBeenCalled();
  });

  it.each([
    0, 1,
  ])('第 %i 段失败，另一段成功：只重试失败段，成功段不再查询或提交', async (failedIndex) => {
    const { pipeline, io, submitted, compose } = harness();
    await advanceKlingPipeline(pipeline, io);
    const failedId = pipeline.steps[failedIndex].requestId!;
    const read = io.read;
    io.read = async (endpoint, requestId) => {
      if (requestId === failedId) throw failure(endpoint, requestId);
      return read(endpoint, requestId);
    };
    await advanceKlingPipeline(pipeline, io);
    expect(submitted).toHaveLength(3);
    expect(submitted[2].stepId).toBe(`segment-${failedIndex + 1}`);
    expect(returnableVideoCreditEvidence(pipeline)).toBeNull();
    await advanceKlingPipeline(pipeline, io);
    await advanceKlingPipeline(pipeline, io);
    expect(compose).toHaveBeenCalledTimes(1);
    expect(submitted).toHaveLength(3);
    expect(pipeline.videoUrl).toBeTruthy();
  });

  it('每次重试等待该次明确失败，最多重试两次，耗尽后取得三份失败证据退款', async () => {
    const { pipeline, io, submitted } = harness();
    await advanceKlingPipeline(pipeline, io);
    const successId = pipeline.steps[0].requestId!;
    const read = io.read;
    let reportFailure = true;
    const reads: string[] = [];
    io.read = async (endpoint, requestId) => {
      reads.push(requestId);
      if (requestId === successId) return read(endpoint, requestId);
      if (reportFailure) throw failure(endpoint, requestId);
      return { ready: false };
    };
    await advanceKlingPipeline(pipeline, io);
    const firstRetryId = pipeline.steps[1].requestId!;
    expect(submitted).toHaveLength(3);
    expect(reads).not.toContain(firstRetryId);
    reportFailure = false;
    for (let tick = 0; tick < 4; tick++)
      await advanceKlingPipeline(pipeline, io);
    expect(submitted).toHaveLength(3);
    expect(pipeline.steps[1].requestId).toBe(firstRetryId);
    expect(returnableVideoCreditEvidence(pipeline)).toBeNull();
    reportFailure = true;
    await advanceKlingPipeline(pipeline, io);
    expect(submitted).toHaveLength(4);
    expect(pipeline.steps[1].requestId).not.toBe(firstRetryId);
    await advanceKlingPipeline(pipeline, io);
    expect(returnableVideoCreditEvidence(pipeline)).toHaveLength(3);
    expect(
      new Set(pipeline.steps[1].failures.map((entry) => entry.requestId)).size
    ).toBe(3);
    for (let tick = 0; tick < 4; tick++)
      await advanceKlingPipeline(pipeline, io);
    expect(submitted).toHaveLength(4);
    expect(
      submitted.filter((entry) => entry.stepId === 'segment-1')
    ).toHaveLength(1);
  });

  it('一段失败、另一段仍在生成时不重试，也不退款', async () => {
    const { pipeline, io, submitted } = harness();
    await advanceKlingPipeline(pipeline, io);
    const failedId = pipeline.steps[0].requestId!;
    io.read = async (endpoint, requestId) => {
      if (requestId === failedId) throw failure(endpoint, requestId);
      return { ready: false };
    };
    for (let tick = 0; tick < 5; tick++)
      await advanceKlingPipeline(pipeline, io);
    expect(submitted).toHaveLength(2);
    expect(returnableVideoCreditEvidence(pipeline)).toBeNull();
    expect(pipeline.steps[0].failures).toHaveLength(1);
  });

  it('重试时提交超时，不再提交、不退款，保留成功分段', async () => {
    const { pipeline, io, submitted } = harness();
    await advanceKlingPipeline(pipeline, io);
    const failedId = pipeline.steps[1].requestId!;
    const read = io.read;
    io.read = async (endpoint, requestId) => {
      if (requestId === failedId) throw failure(endpoint, requestId);
      return read(endpoint, requestId);
    };
    io.submit = vi.fn(async () => {
      throw new TypeError('timeout');
    });
    await advanceKlingPipeline(pipeline, io);
    for (let tick = 0; tick < 4; tick++)
      await advanceKlingPipeline(pipeline, io);
    expect(io.submit).toHaveBeenCalledTimes(1);
    expect(pipeline.steps[0].state).toBe('done');
    expect(pipeline.steps[1].state).toBe('unknown');
    expect(returnableVideoCreditEvidence(pipeline)).toBeNull();
    expect(submitted).toHaveLength(2);
  });

  it('本地拼接失败只重试合成，不调用模型、不退款', async () => {
    const { pipeline, io, submitted, compose } = harness();
    compose.mockRejectedValueOnce(new Error('local ffmpeg unavailable'));
    await advanceKlingPipeline(pipeline, io);
    await advanceKlingPipeline(pipeline, io);
    await advanceKlingPipeline(pipeline, io);
    expect(pipeline.compositionError).toBe(true);
    expect(pipeline.videoUrl).toBeUndefined();
    expect(returnableVideoCreditEvidence(pipeline)).toBeNull();
    await advanceKlingPipeline(pipeline, io);
    expect(pipeline.compositionError).toBe(false);
    expect(pipeline.videoUrl).toBeTruthy();
    expect(compose).toHaveBeenCalledTimes(2);
    expect(submitted).toHaveLength(2);
  });

  it('合成期间退出后，恢复仅重新合成', async () => {
    const { pipeline, io, submitted, compose } = harness();
    await advanceKlingPipeline(pipeline, io);
    await advanceKlingPipeline(pipeline, io);
    pipeline.steps[2].state = 'submitting';
    await advanceKlingPipeline(pipeline, io);
    expect(compose).toHaveBeenCalledTimes(1);
    expect(submitted).toHaveLength(2);
  });

  it('提交失败或提交身份落库失败不会盲目重发', async () => {
    const { pipeline, io, submitted, saved } = harness();
    const persist = io.persist;
    io.persist = async (next) => {
      if (next.steps[0].state === 'queued')
        throw new Error('database unavailable');
      await persist(next);
    };
    await expect(advanceKlingPipeline(pipeline, io)).rejects.toThrow(
      'database unavailable'
    );
    const recovered = saved.at(-1)!;
    expect(recovered.steps[0].state).toBe('submitting');
    await advanceKlingPipeline(recovered, { ...io, persist });
    expect(recovered.steps[0].state).toBe('unknown');
    expect(submitted).toHaveLength(1);
  });

  it('查询断网保留原任务，不算失败证据', async () => {
    const { pipeline, io, submitted } = harness();
    await advanceKlingPipeline(pipeline, io);
    const requestId = pipeline.steps[0].requestId;
    io.read = async () => {
      throw new TypeError('network');
    };
    await expect(advanceKlingPipeline(pipeline, io)).rejects.toThrow('network');
    expect(pipeline.steps[0]).toMatchObject({
      state: 'queued',
      requestId,
      failures: [],
    });
    expect(returnableVideoCreditEvidence(pipeline)).toBeNull();
    expect(submitted).toHaveLength(2);
  });

  it('其他任务的失败不能作为重试或退款依据', async () => {
    const { pipeline, io, submitted } = harness();
    await advanceKlingPipeline(pipeline, io);
    io.read = async (endpoint) => {
      throw failure(endpoint, randomUUID());
    };
    await expect(advanceKlingPipeline(pipeline, io)).rejects.toThrow(
      'does not match'
    );
    expect(returnableVideoCreditEvidence(pipeline)).toBeNull();
    expect(submitted).toHaveLength(2);
  });

  it('缺少视频链接不算明确失败，不重新提交', async () => {
    const { pipeline, io, outputs, submitted } = harness();
    await advanceKlingPipeline(pipeline, io);
    outputs.set(pipeline.steps[0].requestId!, {});
    await expect(advanceKlingPipeline(pipeline, io)).rejects.toThrow();
    expect(pipeline.steps[0].state).toBe('queued');
    expect(returnableVideoCreditEvidence(pipeline)).toBeNull();
    expect(submitted).toHaveLength(2);
  });

  it('恢复旧记录保留模型任务身份，取消检查步骤', () => {
    const { pipeline } = harness();
    const ids = [
      'segment-1',
      'segment-2',
      'inspect-1',
      'inspect-2',
      'merge',
      'audio',
      'verify',
    ];
    const requestId = randomUUID();
    const recovered = klingPipelineSchema.parse({
      ...pipeline,
      version: 1,
      steps: ids.map((id) => ({
        id,
        state: id === 'segment-1' ? 'queued' : 'idle',
        ...(id === 'segment-1' ? { requestId } : {}),
      })),
    });
    expect(recovered.steps.map((step) => step.id)).toEqual([
      'segment-1',
      'segment-2',
      'merge',
      'audio',
    ]);
    expect(recovered.steps[0].requestId).toBe(requestId);
    expect(recovered.steps[0].failures).toEqual([]);
  });
});
