import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { and, eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  studioVideo,
  userCredit,
  creditTransaction,
} from '../../src/db/schema';

const dependencies = vi.hoisted(() => ({
  getDb: vi.fn(),
  submit: vi.fn(),
  read: vi.fn(),
  photo: vi.fn(),
  reference: vi.fn(),
  compose: vi.fn(),
}));
vi.mock('../../src/db', () => ({ getDb: dependencies.getDb }));
vi.mock('../../src/studio/photo-storage', () => ({
  storeStudioPhoto: dependencies.photo,
}));
vi.mock('../../src/studio/reference-storage', () => ({
  storeStudioReference: dependencies.reference,
}));
vi.mock('../../src/studio/fal-webhook-url', () => ({
  createFalWebhookUrl: () => 'https://callbacks.example/api/webhooks/fal',
}));
vi.mock('../../src/studio/video-storage', () => ({
  finishStudioVideo: dependencies.compose,
}));
vi.mock('../../src/studio/fal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/studio/fal')>()),
  submitFalTask: dependencies.submit,
  readFalTask: dependencies.read,
}));
import { FalRequestError, FalTaskFailedError } from '../../src/studio/fal';
import {
  createStudioVideo,
  getOwnedVideo,
  refreshStudioVideo,
  publicVideoJob,
  completeCallbackVideo,
} from '../../src/studio/video-jobs';

const postgres = new PGlite();
const db = drizzle(postgres);
beforeAll(async () => {
  await postgres.exec('CREATE TABLE "user" (id text PRIMARY KEY);');
  for (const filename of [
    '0001_woozy_jigsaw.sql',
    '0010_productive_mole_man.sql',
    '0011_aspiring_star_brand.sql',
    '0012_careless_surge.sql',
    '0013_gray_marvel_zombies.sql',
    '0014_glamorous_lady_ursula.sql',
    '0015_lethal_peter_parker.sql',
  ])
    await postgres.exec(
      await readFile(
        new URL(`../../src/db/migrations/${filename}`, import.meta.url),
        'utf8'
      )
    );
  await postgres.exec("INSERT INTO \"user\" (id) VALUES ('alice'), ('bob');");
}, 30_000);
afterAll(async () => {
  await postgres.close();
});
beforeEach(async () => {
  vi.clearAllMocks();
  dependencies.getDb.mockResolvedValue(db);
  dependencies.photo.mockResolvedValue('https://photos.example/alice.jpg');
  dependencies.reference.mockResolvedValue({
    referenceVideoUrl: 'https://references.example/full-15s.mp4',
  });
  dependencies.submit.mockImplementation(async () => randomUUID());
  dependencies.read.mockResolvedValue({ ready: false });
  dependencies.compose.mockResolvedValue(
    'https://results.example/finished.mp4'
  );
  await postgres.exec(
    'TRUNCATE studio_video, user_credit, credit_transaction;'
  );
  for (const [userId, currentCredits] of [
    ['alice', 200],
    ['bob', 100],
  ] as const) {
    await db
      .insert(userCredit)
      .values({ id: randomUUID(), userId, currentCredits });
    await db.insert(creditTransaction).values({
      id: randomUUID(),
      userId,
      type: 'PURCHASE_PACKAGE',
      description: 'Paid test fixture',
      amount: currentCredits,
      remainingAmount: currentCredits,
      idempotencyKey: 'seed:' + userId,
    });
  }
});

async function balance(userId = 'alice') {
  return (
    await db.select().from(userCredit).where(eq(userCredit.userId, userId))
  )[0]?.currentCredits;
}

function rejectFalTask() {
  dependencies.read.mockImplementation(async (endpoint, requestId) => {
    throw new FalTaskFailedError({
      endpoint,
      requestId,
      source: 'queue-status',
      status: 'COMPLETED',
      errorType: 'runner_server_error',
    });
  });
}

describe('本地 PostgreSQL 扣费与退款事务', () => {
  it('关闭页面后回调完成合成，重复投递不重生成或重复合成', async () => {
    const video = await createStudioVideo(
      'alice', randomUUID(), 'chandelier', Buffer.from('photo')
    );
    const pipeline = video.klingPipeline!;
    pipeline.steps[0].state = 'done';
    pipeline.steps[0].output = { video: { url: 'https://videos.example/source.mp4' } };
    await db.update(studioVideo).set({ klingPipeline: pipeline })
      .where(eq(studioVideo.id, video.id));
    const context = {
      videoId: video.id, stepId: 'segment-1' as const,
      submissionId: pipeline.steps[0].submissionId!,
    };
    await completeCallbackVideo(context);
    await completeCallbackVideo(context);
    expect((await getOwnedVideo(video.id, 'alice')).status).toBe('succeeded');
    expect(await balance()).toBe(100);
    expect(dependencies.submit).toHaveBeenCalledTimes(1);
    expect(dependencies.read).not.toHaveBeenCalled();
    expect(dependencies.compose).toHaveBeenCalledTimes(1);
  });
  it('回调完成失败退款，重复投递仍只退一次', async () => {
    const video = await createStudioVideo(
      'alice', randomUUID(), 'chandelier', Buffer.from('photo')
    );
    const pipeline = video.klingPipeline!;
    pipeline.steps[0].state = 'failed';
    pipeline.steps[0].failures = [{
      endpoint: 'fal-ai/kling-video/o3/standard/video-to-video/edit',
      requestId: pipeline.steps[0].requestId!, source: 'webhook',
      status: 'ERROR', error: 'invalid input',
    }];
    await db.update(studioVideo).set({ klingPipeline: pipeline })
      .where(eq(studioVideo.id, video.id));
    const context = {
      videoId: video.id, stepId: 'segment-1' as const,
      submissionId: pipeline.steps[0].submissionId!,
    };
    await completeCallbackVideo(context);
    await completeCallbackVideo(context);
    expect((await getOwnedVideo(video.id, 'alice')).status).toBe('failed');
    expect(await balance()).toBe(200);
    expect(await db.select().from(creditTransaction)
      .where(eq(creditTransaction.type, 'REFUND'))).toHaveLength(1);
    expect(dependencies.submit).toHaveBeenCalledTimes(1);
    expect(dependencies.read).not.toHaveBeenCalled();
  });
  it('过期回调不能推进另一提交，也不能启动空闲模型步骤', async () => {
    const video = await createStudioVideo(
      'alice', randomUUID(), 'chandelier', Buffer.from('photo')
    );
    const context = {
      videoId: video.id, stepId: 'segment-1' as const,
      submissionId: randomUUID(),
    };
    await expect(completeCallbackVideo(context)).rejects.toThrow('matching submitted');
    const pipeline = video.klingPipeline!;
    pipeline.steps[0].state = 'idle';
    await db.update(studioVideo).set({ klingPipeline: pipeline })
      .where(eq(studioVideo.id, video.id));
    await expect(completeCallbackVideo({
      ...context, submissionId: pipeline.steps[0].submissionId!,
    })).rejects.toThrow('matching submitted');
    expect(dependencies.submit).toHaveBeenCalledTimes(1);
    expect(dependencies.read).not.toHaveBeenCalled();
    expect(dependencies.compose).not.toHaveBeenCalled();
  });
  it('同一提交重复请求只扣一个 take、只提交一次模型', async () => {
    const requestId = randomUUID();
    const photo = Buffer.from('normalized photo');
    const first = await createStudioVideo(
      'alice',
      requestId,
      'chandelier',
      photo
    );
    const repeated = await createStudioVideo(
      'alice',
      requestId,
      'chandelier',
      photo
    );
    expect(repeated.id).toBe(first.id);
    expect(await balance()).toBe(100);
    expect(await db.select().from(studioVideo)).toHaveLength(1);
    expect(
      await db
        .select()
        .from(creditTransaction)
        .where(eq(creditTransaction.type, 'USAGE'))
    ).toHaveLength(1);
    expect(dependencies.submit).toHaveBeenCalledTimes(1);
  });
  it('余额不足回滚任务创建，不上传照片、不调用付费 API', async () => {
    await db
      .update(userCredit)
      .set({ currentCredits: 0 })
      .where(eq(userCredit.userId, 'alice'));
    await expect(
      createStudioVideo(
        'alice',
        randomUUID(),
        'chandelier',
        Buffer.from('photo')
      )
    ).rejects.toMatchObject({ status: 402 });
    expect(await db.select().from(studioVideo)).toHaveLength(0);
    expect(dependencies.photo).not.toHaveBeenCalled();
    expect(dependencies.submit).not.toHaveBeenCalled();
  });
  it('两个并发提交争用最后一个 take，最多一条被接受', async () => {
    await db
      .update(userCredit)
      .set({ currentCredits: 100 })
      .where(eq(userCredit.userId, 'alice'));
    const outcomes = await Promise.allSettled([
      createStudioVideo(
        'alice',
        randomUUID(),
        'chandelier',
        Buffer.from('photo A')
      ),
      createStudioVideo(
        'alice',
        randomUUID(),
        'chandelier',
        Buffer.from('photo B')
      ),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled')
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected')
    ).toHaveLength(1);
    expect(await balance()).toBe(0);
    expect(await db.select().from(studioVideo)).toHaveLength(1);
    expect(dependencies.submit).toHaveBeenCalledTimes(1);
  });
  it('并发重放同一提交，只建立一个父任务', async () => {
    const requestId = randomUUID();
    const photo = Buffer.from('photo');
    const results = await Promise.all([
      createStudioVideo('alice', requestId, 'chandelier', photo),
      createStudioVideo('alice', requestId, 'chandelier', photo),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(await balance()).toBe(100);
    expect(dependencies.submit).toHaveBeenCalledTimes(1);
  });
  it('复用提交身份但篡改照片被拒绝，不再次扣次数', async () => {
    const requestId = randomUUID();
    await createStudioVideo(
      'alice',
      requestId,
      'chandelier',
      Buffer.from('photo A')
    );
    await expect(
      createStudioVideo(
        'alice',
        requestId,
        'chandelier',
        Buffer.from('photo B')
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(await balance()).toBe(100);
    expect(dependencies.submit).toHaveBeenCalledTimes(1);
  });
  it('模型明确失败整条只退一次，重复查询不能反复退回', async () => {
    const video = await createStudioVideo(
      'alice',
      randomUUID(),
      'chandelier',
      Buffer.from('photo')
    );
    rejectFalTask();
    await db
      .update(studioVideo)
      .set({ updatedAt: new Date(0) })
      .where(eq(studioVideo.id, video.id));
    const failed = await refreshStudioVideo(video.id, 'alice');
    expect(failed.status).toBe('failed');
    expect(failed.refundedAt).toBeInstanceOf(Date);
    expect(publicVideoJob(failed)).toMatchObject({
      refunded: true,
      message:
        'This video could not be generated. Your 100 credits have been returned to your balance.',
    });
    expect(await balance()).toBe(200);
    for (let retry = 0; retry < 3; retry++)
      await refreshStudioVideo(video.id, 'alice');
    expect(await balance()).toBe(200);
    expect(dependencies.read).toHaveBeenCalledTimes(1);
    expect(
      await db
        .select()
        .from(creditTransaction)
        .where(eq(creditTransaction.type, 'REFUND'))
    ).toHaveLength(1);
  });
  it('模型成功后本地音轨处理失败自动重试，不退次数、不重新调用生成模型', async () => {
    const video = await createStudioVideo(
      'alice',
      randomUUID(),
      'chandelier',
      Buffer.from('photo')
    );
    dependencies.read.mockImplementation(async (_endpoint, requestId) => ({
      ready: true,
      output: { video: { url: `https://videos.example/${requestId}.mp4` } },
    }));
    dependencies.compose.mockRejectedValueOnce(new Error('ffmpeg failed'));
    for (let tick = 0; tick < 3; tick++) {
      await db
        .update(studioVideo)
        .set({ updatedAt: new Date(0) })
        .where(eq(studioVideo.id, video.id));
      const updated = await refreshStudioVideo(video.id, 'alice');
      expect(updated.refundedAt).toBeNull();
      expect(await balance()).toBe(100);
    }
    const complete = await getOwnedVideo(video.id, 'alice');
    expect(complete.status).toBe('succeeded');
    expect(complete.videoUrl).toBe('https://results.example/finished.mp4');
    expect(dependencies.compose).toHaveBeenCalledTimes(2);
    expect(dependencies.submit).toHaveBeenCalledTimes(1);
  });
  it('准备照片失败尚未扣次数或调用 fal，重试同一提交可以继续', async () => {
    dependencies.photo.mockRejectedValueOnce(new Error('storage unavailable'));
    const requestId = randomUUID();
    await expect(
      createStudioVideo('alice', requestId, 'chandelier', Buffer.from('photo'))
    ).rejects.toThrow('storage unavailable');
    expect(await balance()).toBe(200);
    expect(await db.select().from(studioVideo)).toHaveLength(0);
    expect(dependencies.submit).not.toHaveBeenCalled();
    const retried = await createStudioVideo(
      'alice',
      requestId,
      'chandelier',
      Buffer.from('photo')
    );
    expect(retried.status).toBe('processing');
    expect(await balance()).toBe(100);
    expect(dependencies.submit).toHaveBeenCalledTimes(1);
  });
  it('提交结果未知不会退款或重新付费，重复 POST 也复用同一任务', async () => {
    dependencies.submit.mockRejectedValueOnce(new TypeError('timeout'));
    const requestId = randomUUID();
    const unknown = await createStudioVideo(
      'alice',
      requestId,
      'chandelier',
      Buffer.from('photo')
    );
    expect(unknown.status).toBe('processing');
    expect(unknown.refundedAt).toBeNull();
    expect(await balance()).toBe(100);
    await createStudioVideo(
      'alice',
      requestId,
      'chandelier',
      Buffer.from('photo')
    );
    await db
      .update(studioVideo)
      .set({ updatedAt: new Date(0) })
      .where(eq(studioVideo.id, unknown.id));
    await refreshStudioVideo(unknown.id, 'alice');
    expect(dependencies.submit).toHaveBeenCalledTimes(1);
  });
  it.each([
    400, 422, 503,
  ])('提交 HTTP %s 没有最终任务失败响应时不能退款或自动重发', async (status) => {
    dependencies.submit.mockRejectedValue(new FalRequestError(status));
    const requestId = randomUUID();
    const video = await createStudioVideo(
      'alice',
      requestId,
      'chandelier',
      Buffer.from('photo')
    );
    for (let retry = 0; retry < 3; retry++)
      await createStudioVideo(
        'alice',
        requestId,
        'chandelier',
        Buffer.from('photo')
      );
    expect(video.status).toBe('processing');
    expect(video.refundedAt).toBeNull();
    expect(await balance()).toBe(100);
    expect(dependencies.submit).toHaveBeenCalledTimes(1);
    expect(publicVideoJob(video).refunded).toBe(false);
  });
  it('已提交任务反复查询报错不退款、不再次调用生成接口', async () => {
    const video = await createStudioVideo(
      'alice',
      randomUUID(),
      'chandelier',
      Buffer.from('photo')
    );
    dependencies.read.mockRejectedValue(new FalRequestError(503));
    for (let retry = 0; retry < 3; retry++) {
      await db
        .update(studioVideo)
        .set({ updatedAt: new Date(0) })
        .where(eq(studioVideo.id, video.id));
      await refreshStudioVideo(video.id, 'alice');
    }
    expect(await balance()).toBe(100);
    expect((await getOwnedVideo(video.id, 'alice')).refundedAt).toBeNull();
    expect(dependencies.submit).toHaveBeenCalledTimes(1);
    expect(dependencies.read).toHaveBeenCalledTimes(3);
  });
  it('缺少结果链接不退款，恢复后查询原任务', async () => {
    const video = await createStudioVideo(
      'alice',
      randomUUID(),
      'chandelier',
      Buffer.from('photo')
    );
    dependencies.read.mockResolvedValue({ ready: true, output: {} });
    await db
      .update(studioVideo)
      .set({ updatedAt: new Date(0) })
      .where(eq(studioVideo.id, video.id));
    await expect(refreshStudioVideo(video.id, 'alice')).rejects.toThrow();
    expect(await balance()).toBe(100);
    expect((await getOwnedVideo(video.id, 'alice')).refundedAt).toBeNull();
    dependencies.read.mockResolvedValue({ ready: false });
    await refreshStudioVideo(video.id, 'alice');
    expect(dependencies.submit).toHaveBeenCalledTimes(1);
  });
  it('仅有本地失败文字，没有 fal 最终失败证据时不能退次数', async () => {
    const video = await createStudioVideo(
      'alice',
      randomUUID(),
      'chandelier',
      Buffer.from('photo')
    );
    await db
      .update(studioVideo)
      .set({
        updatedAt: new Date(0),
        klingPipeline: {
          ...video.klingPipeline!,
          failureReason: 'local error',
        },
      })
      .where(eq(studioVideo.id, video.id));
    await refreshStudioVideo(video.id, 'alice');
    expect(await balance()).toBe(100);
    expect((await getOwnedVideo(video.id, 'alice')).refundedAt).toBeNull();
  });
  it('别的用户不能读取或推进任务', async () => {
    const video = await createStudioVideo(
      'alice',
      randomUUID(),
      'chandelier',
      Buffer.from('photo')
    );
    await expect(getOwnedVideo(video.id, 'bob')).rejects.toMatchObject({
      status: 404,
    });
    await expect(refreshStudioVideo(video.id, 'bob')).rejects.toMatchObject({
      status: 404,
    });
    expect(await balance('bob')).toBe(100);
    expect(dependencies.read).not.toHaveBeenCalled();
  });
  it('退款钱包写入失败时，任务失败标记和退款标记一起回滚', async () => {
    const video = await createStudioVideo(
      'alice',
      randomUUID(),
      'chandelier',
      Buffer.from('photo')
    );
    // 在临时数据库注入写入拒绝，模拟退款事务第二步失败。
    await postgres.exec(
      "CREATE FUNCTION reject_wallet_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'wallet unavailable'; END; $$; CREATE TRIGGER reject_refund BEFORE UPDATE ON user_credit FOR EACH ROW EXECUTE FUNCTION reject_wallet_update();"
    );
    try {
      rejectFalTask();
      await db
        .update(studioVideo)
        .set({ updatedAt: new Date(0) })
        .where(eq(studioVideo.id, video.id));
      await expect(refreshStudioVideo(video.id, 'alice')).rejects.toThrow();
      const saved = await getOwnedVideo(video.id, 'alice');
      expect(saved.status).toBe('processing');
      expect(saved.refundedAt).toBeNull();
      expect(await balance()).toBe(100);
    } finally {
      await postgres.exec(
        'DROP TRIGGER reject_refund ON user_credit; DROP FUNCTION reject_wallet_update();'
      );
    }
  });
});
