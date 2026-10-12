import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  user: vi.fn(),
  owned: vi.fn(),
  url: vi.fn(),
}));
vi.mock('../../src/studio/auth', () => ({ getStudioUser: dependencies.user }));
vi.mock('../../src/studio/video-jobs', () => ({
  getOwnedVideo: dependencies.owned,
  VideoRequestError: class extends Error {
    constructor(
      message: string,
      public status: number
    ) {
      super(message);
    }
  },
}));
vi.mock('../../src/studio/r2-storage', () => ({
  getStoredVideoUrl: dependencies.url,
  StoredVideoUnavailableError: class extends Error {},
}));
import { GET } from '../../src/app/api/studio/videos/[id]/file/route';
import { VideoRequestError } from '../../src/studio/video-jobs';

const id = 'a'.repeat(32);
const request = () =>
  new Request(
    `https://burningbridgesai.cc/api/studio/videos/${id}/file?userId=bob`
  );
const params = () => ({ params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
  dependencies.user.mockResolvedValue({ id: 'alice' });
  dependencies.owned.mockResolvedValue({
    status: 'succeeded',
    videoUrl: 'https://old.example/stale.mp4',
    updatedAt: new Date('2026-10-04T12:00:00Z'),
  });
  dependencies.url.mockResolvedValue('https://r2.example/fresh.mp4');
});
afterEach(() => vi.useRealTimers());

describe('本人视频访问和到期边界', () => {
  it('未登录不能获取成片签名', async () => {
    dependencies.user.mockResolvedValue(null);
    expect((await GET(request(), params())).status).toBe(401);
    expect(dependencies.owned).not.toHaveBeenCalled();
    expect(dependencies.url).not.toHaveBeenCalled();
  });
  it('从服务端会话确认归属，不信任查询参数的用户ID', async () => {
    const response = await GET(request(), params());
    expect(dependencies.owned).toHaveBeenCalledWith(id, 'alice');
    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe(
      'https://r2.example/fresh.mp4'
    );
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
  it('非本人任务不签名，过期任务也不签名', async () => {
    dependencies.owned.mockRejectedValueOnce(
      new VideoRequestError('Not found', 404)
    );
    expect((await GET(request(), params())).status).toBe(404);
    dependencies.owned.mockResolvedValueOnce({
      status: 'succeeded',
      videoUrl: 'https://old.example/stale.mp4',
      updatedAt: new Date('2026-09-28T12:00:00Z'),
    });
    expect((await GET(request(), params())).status).toBe(410);
    expect(dependencies.url).not.toHaveBeenCalled();
  });
  it('未完成任务不能获取成片签名', async () => {
    dependencies.owned.mockResolvedValue({
      status: 'processing',
      videoUrl: null,
    });
    expect((await GET(request(), params())).status).toBe(409);
    expect(dependencies.url).not.toHaveBeenCalled();
  });
});
