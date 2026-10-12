import { afterEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  getStudioUser: vi.fn(),
  getStudioAvailability: vi.fn(),
  createStudioVideo: vi.fn(),
  refreshStudioVideo: vi.fn(),
}));
vi.mock('../../src/studio/auth', () => ({
  getStudioUser: dependencies.getStudioUser,
}));
vi.mock('../../src/studio/availability', () => ({
  getStudioAvailability: dependencies.getStudioAvailability,
}));
vi.mock('../../src/studio/video-jobs', () => ({
  createStudioVideo: dependencies.createStudioVideo,
  refreshStudioVideo: dependencies.refreshStudioVideo,
  publicVideoJob: vi.fn(),
  VideoRequestError: class extends Error {},
}));
import { POST } from '../../src/app/api/studio/videos/route';
import { GET } from '../../src/app/api/studio/videos/[id]/route';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('视频接口身份边界', () => {
  it('未同意照片授权和服务条款时，不能进入生成或扣费', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://burningbridgesai.cc');
    dependencies.getStudioUser.mockResolvedValue({ id: 'session-user' });
    dependencies.getStudioAvailability.mockReturnValue({
      generationReady: true,
    });
    for (const consent of [null, 'false']) {
      const form = new FormData();
      form.set('requestId', '7b987ca5-ce09-431b-a832-e2a4a04f78b1');
      form.set('sceneId', 'chandelier');
      if (consent !== null) form.set('consent', consent);
      const response = await POST(
        new Request('https://burningbridgesai.cc/api/studio/videos', {
          method: 'POST',
          headers: { origin: 'https://burningbridgesai.cc' },
          body: form,
        })
      );
      expect(response.status).toBe(400);
    }
    expect(dependencies.createStudioVideo).not.toHaveBeenCalled();
  });
  it('跨站提交在任何生成或扣费之前拒绝', async () => {
    const response = await POST(
      new Request('https://burningbridgesai.cc/api/studio/videos', {
        method: 'POST',
        headers: { origin: 'https://other.example' },
      })
    );
    expect(response.status).toBe(403);
    expect(dependencies.getStudioUser).not.toHaveBeenCalled();
    expect(dependencies.createStudioVideo).not.toHaveBeenCalled();
  });
  it('未登录不能提交或查询任务', async () => {
    dependencies.getStudioUser.mockResolvedValue(null);
    const created = await POST(
      new Request('https://burningbridgesai.cc/api/studio/videos', {
        method: 'POST',
        headers: { origin: 'https://burningbridgesai.cc' },
      })
    );
    const read = await GET(
      new Request('https://burningbridgesai.cc/api/studio/videos/test'),
      { params: Promise.resolve({ id: 'a'.repeat(32) }) }
    );
    expect(created.status).toBe(401);
    expect(read.status).toBe(401);
    expect(dependencies.createStudioVideo).not.toHaveBeenCalled();
    expect(dependencies.refreshStudioVideo).not.toHaveBeenCalled();
  });
  it('服务尚未开放时，已登录用户也不会上传或扣次数', async () => {
    dependencies.getStudioUser.mockResolvedValue({ id: 'session-user' });
    dependencies.getStudioAvailability.mockReturnValue({
      generationReady: false,
    });
    const response = await POST(
      new Request('https://burningbridgesai.cc/api/studio/videos', {
        method: 'POST',
        headers: { origin: 'https://burningbridgesai.cc' },
      })
    );
    expect(response.status).toBe(503);
    expect(dependencies.createStudioVideo).not.toHaveBeenCalled();
  });
});
