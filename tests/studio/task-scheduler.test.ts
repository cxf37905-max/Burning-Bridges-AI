import { afterEach, describe, expect, it, vi } from 'vitest';
const advance = vi.hoisted(() => vi.fn());
const cleanup = vi.hoisted(() => vi.fn());
vi.mock('../../src/studio/r2-retention', () => ({
  deleteExpiredStudioMedia: cleanup,
}));
vi.mock('../../src/studio/video-jobs', () => ({
  advancePendingVideos: advance,
}));
import { GET } from '../../src/app/api/studio/tasks/route';
import { GET as cleanupMedia } from '../../src/app/api/studio/cleanup/route';
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe('后台任务调度身份', () => {
  it('清理同样要求调度凭据，失败不能返回成功', async () => {
    vi.stubEnv('CRON_SECRET', 'a'.repeat(32));
    expect(
      (
        await cleanupMedia(
          new Request('https://burningbridgesai.cc/api/studio/cleanup')
        )
      ).status
    ).toBe(401);
    expect(cleanup).not.toHaveBeenCalled();
    const request = new Request(
      'https://burningbridgesai.cc/api/studio/cleanup',
      {
        headers: { authorization: `Bearer ${'a'.repeat(32)}` },
      }
    );
    cleanup.mockRejectedValueOnce(new Error('Delete failed'));
    await expect(cleanupMedia(request)).rejects.toThrow('Delete failed');
    cleanup.mockResolvedValue({ examined: 3, deleted: 2 });
    expect(await (await cleanupMedia(request)).json()).toEqual({
      examined: 3,
      deleted: 2,
    });
  });
  it('无配置和错误凭据均不能推进任务', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect(
      (await GET(new Request('https://burningbridgesai.cc/api/studio/tasks')))
        .status
    ).toBe(503);
    vi.stubEnv('CRON_SECRET', 'a'.repeat(32));
    expect(
      (
        await GET(
          new Request('https://burningbridgesai.cc/api/studio/tasks', {
            headers: { authorization: `Bearer ${'b'.repeat(32)}` },
          })
        )
      ).status
    ).toBe(401);
    expect(advance).not.toHaveBeenCalled();
  });
  it('有效调度凭据只调用服务端待处理列表', async () => {
    vi.stubEnv('CRON_SECRET', 'a'.repeat(32));
    advance.mockResolvedValue({ examined: 2, failed: 0 });
    const response = await GET(
      new Request('https://burningbridgesai.cc/api/studio/tasks', {
        headers: { authorization: `Bearer ${'a'.repeat(32)}` },
      })
    );
    expect(response.status).toBe(200);
    expect(advance).toHaveBeenCalledExactlyOnceWith();
  });
});
