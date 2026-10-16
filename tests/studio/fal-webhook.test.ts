import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  after: vi.fn(), record: vi.fn(), complete: vi.fn(), signature: vi.fn(),
}));
vi.mock('next/server', () => ({ after: dependencies.after }));
vi.mock('../../src/studio/video-jobs', () => ({
  completeCallbackVideo: dependencies.complete,
}));
vi.mock('../../src/studio/fal-webhook', async (original) => ({
  ...(await original<typeof import('../../src/studio/fal-webhook')>()),
  recordFalWebhook: dependencies.record,
}));
vi.mock('../../src/studio/fal-webhook-signature', () => ({
  verifyFalWebhookSignature: dependencies.signature,
}));
import { POST } from '../../src/app/api/webhooks/fal/route';
import { createFalWebhookUrl } from '../../src/studio/fal-webhook-url';

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

function callbackRequest() {
  vi.stubEnv('CRON_SECRET', 'a'.repeat(32));
  vi.stubEnv('FAL_WEBHOOK_BASE_URL', 'https://burningbridgesai.cc');
  const context = {
    videoId: 'a'.repeat(32), stepId: 'segment-1' as const,
    submissionId: randomUUID(),
  };
  const requestId = randomUUID();
  return {
    context,
    request: new Request(createFalWebhookUrl(context), {
      method: 'POST', headers: { 'x-fal-webhook-request-id': requestId },
      body: JSON.stringify({
        request_id: requestId, status: 'OK',
        payload: { video: { url: 'https://videos.fal.media/finished.mp4' } },
      }),
    }),
  };
}

describe('生成回调后台完成与重投', () => {
  it('先保留重投机会，再后台完成同一任务', async () => {
    const { context, request } = callbackRequest();
    dependencies.signature.mockResolvedValue(true);
    dependencies.record.mockResolvedValue(true);
    dependencies.complete.mockResolvedValue(undefined);
    expect((await POST(request)).status).toBe(503);
    expect(dependencies.complete).not.toHaveBeenCalled();
    await dependencies.after.mock.calls[0][0]();
    expect(dependencies.complete).toHaveBeenCalledExactlyOnceWith(context);
  });
  it('已完成任务再次投递返回 200，不重复后处理', async () => {
    const { request } = callbackRequest();
    dependencies.signature.mockResolvedValue(true);
    dependencies.record.mockResolvedValue(false);
    expect((await POST(request)).status).toBe(200);
    expect(dependencies.after).not.toHaveBeenCalled();
  });
  it('伪造签名不能记录任务或启动后台处理', async () => {
    const { request } = callbackRequest();
    dependencies.signature.mockResolvedValue(false);
    expect((await POST(request)).status).toBe(401);
    expect(dependencies.record).not.toHaveBeenCalled();
    expect(dependencies.after).not.toHaveBeenCalled();
  });
});
