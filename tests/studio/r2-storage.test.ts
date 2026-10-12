import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S3ServiceException } from '@aws-sdk/client-s3';

const storage = vi.hoisted(() => ({
  send: vi.fn(),
  destroy: vi.fn(),
  sign: vi.fn(),
}));
vi.mock('../../src/studio/r2-client', () => ({
  createR2Storage: () => ({ client: storage, bucket: 'private-test-bucket' }),
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: storage.sign,
}));
import {
  getStoredVideoUrl,
  StoredVideoUnavailableError,
} from '../../src/studio/r2-storage';

const id = 'a'.repeat(32);
const now = new Date('2026-10-12T12:00:00Z');
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  storage.sign.mockResolvedValue('https://r2.example/fresh-signed-video');
});
afterEach(() => vi.useRealTimers());

describe('14天内成片签名更新', () => {
  it('第8天仍能签发新链接，且使用服务器构建的R2对象键', async () => {
    storage.send.mockResolvedValue({
      LastModified: new Date('2026-10-04T12:00:00Z'),
    });
    expect(await getStoredVideoUrl(id)).toBe(
      'https://r2.example/fresh-signed-video'
    );
    expect(storage.send.mock.calls[0][0].input.Key).toBe(
      `studio-results/${id}.mp4`
    );
    expect(storage.sign.mock.calls[0][2]).toEqual({ expiresIn: 300 });
    expect(storage.destroy).toHaveBeenCalledOnce();
  });

  it('新签名不能超出剩余保留期', async () => {
    storage.send.mockResolvedValue({
      LastModified: new Date('2026-09-28T12:00:30Z'),
    });
    await getStoredVideoUrl(id);
    expect(storage.sign.mock.calls[0][2]).toEqual({ expiresIn: 30 });
  });

  it('恰好满14天，即便R2尚未清理也拒绝访问', async () => {
    storage.send.mockResolvedValue({
      LastModified: new Date('2026-09-28T12:00:00Z'),
    });
    await expect(getStoredVideoUrl(id)).rejects.toBeInstanceOf(
      StoredVideoUnavailableError
    );
    expect(storage.sign).not.toHaveBeenCalled();
  });

  it('已删除文件返回不可用，网络错误保持原错误', async () => {
    storage.send.mockRejectedValueOnce(
      new S3ServiceException({
        name: 'NotFound',
        $fault: 'client',
        $metadata: { httpStatusCode: 404 },
      })
    );
    await expect(getStoredVideoUrl(id)).rejects.toBeInstanceOf(
      StoredVideoUnavailableError
    );
    storage.send.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(getStoredVideoUrl(id)).rejects.toThrow('network unavailable');
  });
});
