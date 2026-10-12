import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const storage = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn() }));
vi.mock('../../src/studio/r2-client', () => ({
  createR2Storage: () => ({ client: storage, bucket: 'private-test-bucket' }),
}));
import { deleteExpiredStudioMedia } from '../../src/studio/r2-retention';

const now = new Date('2026-10-12T12:00:00Z');
const age = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('R2媒体实际删除', () => {
  it('只删除满24小时照片和满14天视频，未到期文件不删', async () => {
    storage.send.mockImplementation(async (command) => {
      if (command instanceof ListObjectsV2Command)
        return {
          Contents:
            command.input.Prefix === 'studio-inputs/'
              ? [
                  { Key: 'studio-inputs/expired.jpg', LastModified: age(24) },
                  { Key: 'studio-inputs/new.jpg', LastModified: age(23.99) },
                ]
              : [
                  { Key: 'studio-results/expired.mp4', LastModified: age(336) },
                  { Key: 'studio-results/new.mp4', LastModified: age(335.99) },
                ],
        };
      return { Deleted: command.input.Delete.Objects };
    });
    expect(await deleteExpiredStudioMedia(now)).toEqual({
      examined: 4,
      deleted: 2,
    });
    const deletes = storage.send.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof DeleteObjectsCommand);
    expect(deletes.map((command) => command.input.Delete?.Objects)).toEqual([
      [{ Key: 'studio-inputs/expired.jpg' }],
      [{ Key: 'studio-results/expired.mp4' }],
    ]);
    expect(storage.destroy).toHaveBeenCalledOnce();
  });

  it('继续扫描后续分页，包含没有数据库任务的遗留照片', async () => {
    storage.send.mockImplementation(async (command) => {
      if (command instanceof DeleteObjectsCommand)
        return { Deleted: command.input.Delete?.Objects };
      if (command.input.Prefix === 'studio-results/') return {};
      if (!command.input.ContinuationToken)
        return { IsTruncated: true, NextContinuationToken: 'page-2' };
      return {
        Contents: [{ Key: 'studio-inputs/orphan.jpg', LastModified: age(25) }],
      };
    });
    expect(await deleteExpiredStudioMedia(now)).toEqual({
      examined: 1,
      deleted: 1,
    });
    expect(storage.send.mock.calls[1][0].input.ContinuationToken).toBe(
      'page-2'
    );
  });

  it('拒绝前缀外对象，不能删除模板或头像', async () => {
    storage.send.mockResolvedValue({
      Contents: [{ Key: 'avatars/keep.jpg', LastModified: age(500) }],
    });
    await expect(deleteExpiredStudioMedia(now)).rejects.toThrow(
      'Invalid R2 retention object'
    );
    expect(
      storage.send.mock.calls.some(
        ([command]) => command instanceof DeleteObjectsCommand
      )
    ).toBe(false);
    expect(storage.destroy).toHaveBeenCalledOnce();
  });

  it('部分删除失败必须报错，不能把任务报告为成功', async () => {
    storage.send.mockResolvedValueOnce({
      Contents: [{ Key: 'studio-inputs/old.jpg', LastModified: age(25) }],
    });
    storage.send.mockResolvedValueOnce({
      Errors: [{ Key: 'studio-inputs/old.jpg', Code: 'AccessDenied' }],
    });
    await expect(deleteExpiredStudioMedia(now)).rejects.toThrow('AccessDenied');
    expect(storage.destroy).toHaveBeenCalledOnce();
  });

  it('截断响应缺少游标时不能静默遗漏对象', async () => {
    storage.send.mockResolvedValue({ IsTruncated: true });
    await expect(deleteExpiredStudioMedia(now)).rejects.toThrow(
      'no continuation token'
    );
  });
});
