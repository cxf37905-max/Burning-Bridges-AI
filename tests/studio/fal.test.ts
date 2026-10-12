import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FalRequestError,
  FalTaskFailedError,
  readFalTask,
  submitFalTask,
} from '../../src/studio/fal';
const endpoint = 'fal-ai/kling-video/o3/standard/video-to-video/edit';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('fal 付费请求边界', () => {
  it('未配置 Key 时不会请求供应商', async () => {
    vi.stubEnv('FAL_KEY', '');
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(submitFalTask(endpoint, {})).rejects.toThrow('FAL_KEY');
    expect(request).not.toHaveBeenCalled();
  });
  it.each([503, 429])('提交返回 HTTP %s 不自动重试', async (status) => {
    vi.stubEnv('FAL_KEY', 'test-only');
    const request = vi.fn().mockResolvedValue(new Response('{}', { status }));
    vi.stubGlobal('fetch', request);
    await expect(submitFalTask(endpoint, {})).rejects.toBeInstanceOf(
      FalRequestError
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('无效任务身份不当作可安全重发的拒绝', async () => {
    vi.stubEnv('FAL_KEY', 'test-only');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ request_id: 'invalid' }))
    );
    await expect(submitFalTask(endpoint, {})).rejects.toThrow(
      'invalid submission identity'
    );
  });
  it('使用应用根路径查询，不跟随供应商返回的任意地址', async () => {
    vi.stubEnv('FAL_KEY', 'test-only');
    const requestId = randomUUID();
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ request_id: requestId, status: 'COMPLETED' })
      )
      .mockResolvedValueOnce(
        Response.json({ video: { url: 'https://videos.example/ready.mp4' } })
      );
    vi.stubGlobal('fetch', request);
    await expect(readFalTask(endpoint, requestId)).resolves.toMatchObject({
      ready: true,
    });
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      `https://queue.fal.run/fal-ai/kling-video/requests/${requestId}/status`,
      `https://queue.fal.run/fal-ai/kling-video/requests/${requestId}`,
    ]);
    expect(request.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      cache: 'no-store',
    });
  });
  it('拒绝错配的任务身份', async () => {
    vi.stubEnv('FAL_KEY', 'test-only');
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json({ request_id: randomUUID(), status: 'COMPLETED' })
      );
    vi.stubGlobal('fetch', request);
    await expect(readFalTask(endpoint, randomUUID())).rejects.toThrow(
      'different or invalid task identity'
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('队列报告失败时不再读取视频结果', async () => {
    vi.stubEnv('FAL_KEY', 'test-only');
    const requestId = randomUUID();
    const request = vi.fn().mockResolvedValue(
      Response.json({
        request_id: requestId,
        status: 'COMPLETED',
        error_type: 'validation',
      })
    );
    vi.stubGlobal('fetch', request);
    await expect(readFalTask(endpoint, requestId)).rejects.toMatchObject({
      failure: {
        requestId,
        endpoint,
        status: 'COMPLETED',
        source: 'queue-status',
        errorType: 'validation',
      },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([
    400, 422, 500, 503,
  ])('结果 HTTP %s 不能单独证明最终任务失败', async (status) => {
    vi.stubEnv('FAL_KEY', 'test-only');
    const requestId = randomUUID();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ request_id: requestId, status: 'COMPLETED' })
        )
        .mockResolvedValueOnce(new Response('{}', { status }))
    );
    await expect(readFalTask(endpoint, requestId)).rejects.toBeInstanceOf(
      FalRequestError
    );
  });
  it.each([
    'IN_QUEUE',
    'IN_PROGRESS',
  ])('%s 中出现错误信息也不能当作最终失败', async (status) => {
    vi.stubEnv('FAL_KEY', 'test-only');
    const requestId = randomUUID();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          request_id: requestId,
          status,
          error_type: 'runner_disconnected',
        })
      )
    );
    await expect(readFalTask(endpoint, requestId)).resolves.toEqual({
      ready: false,
    });
  });
  it('COMPLETED 但没有失败字段时，不得构造退款证据', () => {
    expect(
      () =>
        new FalTaskFailedError({
          requestId: randomUUID(),
          endpoint,
          source: 'queue-status',
          status: 'COMPLETED',
          error: ' ',
        })
    ).toThrow();
  });
});
