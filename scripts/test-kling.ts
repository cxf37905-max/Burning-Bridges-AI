import { randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  writeFile,
  copyFile,
} from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';
import dotenv from 'dotenv';
import { z } from 'zod';
import {
  FalRequestError,
  FalTaskFailedError,
  readFalTask,
  submitFalTask,
  uploadFalTestFile,
} from '../src/studio/fal';
import {
  createKlingPipeline,
  advanceKlingPipeline,
  klingPipelineSchema,
  klingProgressMessage,
  type KlingPipeline,
} from '../src/studio/kling-pipeline';
import { getKlingTemplate } from '../src/studio/kling-templates';
import { renderKlingTestPreview } from '../src/studio/kling-test-preview';
import { MAX_PHOTO_BYTES } from '../src/studio/photo-validation';
import { normalizeStudioPhoto } from '../src/studio/photo-storage';
import {
  assertStudioCompositionAvailable,
  composeKlingVideo,
} from '../src/studio/video-composition';
import { FalSubmissionNotSentError } from '../src/studio/fal-submission-error';

dotenv.config({ path: '.env', quiet: true });
const { values } = parseArgs({
  options: {
    photo: { type: 'string' },
    resume: { type: 'string' },
    scene: { type: 'string', default: 'chandelier' },
    tier: {
      type: 'string',
      default: process.env.STUDIO_KLING_TIER || 'standard',
    },
    'dry-run': { type: 'boolean' },
    help: { type: 'boolean' },
    'recover-step': { type: 'string' },
    'request-id': { type: 'string' },
  },
});

async function savePipeline(filename: string, pipeline: KlingPipeline) {
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, JSON.stringify(pipeline, null, 2), {
    mode: 0o600,
  });
  await rename(temporary, filename);
}

async function readTestPhoto(filename: string) {
  const resolved = path.resolve(filename);
  const details = await stat(resolved);
  if (!details.isFile() || details.size > MAX_PHOTO_BYTES)
    throw new Error(`照片必须是文件且不超过 20MB：${resolved}`);
  const mime = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  }[path.extname(resolved).toLowerCase()];
  if (!mime) throw new Error(`照片扩展名不支持：${path.extname(resolved)}`);
  return normalizeStudioPhoto(
    new File(
      [new Uint8Array(await readFile(resolved))],
      path.basename(resolved),
      { type: mime }
    )
  );
}

async function createTestPipeline(picture: Buffer) {
  const { overlapReference } = getKlingTemplate(values.scene);
  await assertStudioCompositionAvailable(values.scene);
  const photoUrl = await uploadFalTestFile(
    picture,
    'studio-photo.jpg',
    'image/jpeg'
  );
  const secondReferenceUrl = await uploadFalTestFile(
    await readFile(
      path.resolve('public/studio/reference', overlapReference.filename)
    ),
    overlapReference.filename,
    'video/mp4'
  );
  return createKlingPipeline(photoUrl, values.scene, values.tier, {
    secondReferenceUrl,
    overlapFrames: overlapReference.frames,
  });
}

function restoreRequestIdentity(pipeline: KlingPipeline) {
  if (!values['recover-step'] && !values['request-id']) return;
  const requestId = z.string().uuid().parse(values['request-id']);
  const step = pipeline.steps.find(
    (entry) => entry.id === values['recover-step']
  );
  if (!step || !['unknown', 'submitting'].includes(step.state))
    throw new Error(
      `只能为提交结果不确定的步骤恢复身份：${values['recover-step']}`
    );
  step.requestId = requestId;
  step.state = 'queued';
}

async function runTest() {
  if (values.help) {
    console.log(
      '用法：pnpm test:video --photo "C:\\照片\\me.jpg" [--scene chandelier|after-hours] [--tier standard|pro] [--dry-run]\n恢复：pnpm test:video --resume "绝对路径\\state.json"\n不确定提交：从 fal 历史核对任务后，加 --recover-step segment-1 --request-id UUID'
    );
    return;
  }
  if (Boolean(values.photo) === Boolean(values.resume))
    throw new Error('必须且只能指定 --photo 或 --resume。');
  if ((values['recover-step'] || values['request-id']) && !values.resume)
    throw new Error('恢复上游任务身份必须同时指定 --resume。');
  getKlingTemplate(values.scene);
  z.enum(['standard', 'pro']).parse(values.tier);
  const picture = values.photo ? await readTestPhoto(values.photo) : null;
  if (values['dry-run']) {
    if (values.resume)
      klingPipelineSchema.parse(
        JSON.parse(await readFile(path.resolve(values.resume), 'utf8'))
      );
    console.log(
      `输入参数校验通过。场景 ${values.scene}，档位 ${values.tier}；两段编辑 → 拼接 → 原音轨。不执行本地成片检查。未上传、未提交、未计费。`
    );
    return;
  }
  if (!process.env.FAL_KEY)
    throw new Error(
      '请先在 .env 填入 FAL_KEY，获取入口：https://fal.ai/dashboard/keys'
    );
  const stateFile = values.resume
    ? path.resolve(values.resume)
    : path.resolve('.local', 'kling-tests', randomUUID(), 'state.json');
  await mkdir(path.dirname(stateFile), { recursive: true });
  const lockFile = `${stateFile}.lock`;
  const lock = await open(lockFile, 'wx').catch(
    (reason: NodeJS.ErrnoException) => {
      if (reason.code === 'EEXIST')
        throw new Error(
          `测试已锁定：${lockFile}。确认没有旧测试进程后，删除此锁文件再恢复。`
        );
      throw reason;
    }
  );
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGINT', stop);
  try {
    await lock.writeFile(String(process.pid));
    const pipeline = values.resume
      ? klingPipelineSchema.parse(JSON.parse(await readFile(stateFile, 'utf8')))
      : await createTestPipeline(picture!);
    restoreRequestIdentity(pipeline);
    await savePipeline(stateFile, pipeline);
    console.log(
      `状态已保存：${stateFile}\n本次会调用付费服务；中断后使用 --resume 恢复，不要重新 --photo。`
    );
    const deadline = Date.now() + 30 * 60_000;
    while (
      !stopping &&
      Date.now() < deadline &&
      !pipeline.videoUrl &&
      !pipeline.failureReason
    ) {
      try {
        await advanceKlingPipeline(pipeline, {
          persist: (next) => savePipeline(stateFile, next),
          submit: submitFalTask,
          read: readFalTask,
          compose: (first, second, sceneId, overlapFrames) =>
            composeKlingVideo(
              first,
              second,
              sceneId,
              async (filename) => {
                await copyFile(
                  filename,
                  path.join(path.dirname(stateFile), 'finished.mp4')
                );
                // 测试预览使用同目录文件；状态中的地址仅作为完成标记。
                return 'https://local-test.invalid/finished.mp4';
              },
              overlapFrames
            ),
          getTaskFailure: (reason) =>
            reason instanceof FalTaskFailedError ? reason.failure : null,
          getUnsentSubmission: (reason) =>
            reason instanceof FalSubmissionNotSentError ? reason.proof : null,
        });
      } catch (reason) {
        if (
          !(
            reason instanceof FalRequestError ||
            reason instanceof TypeError ||
            reason instanceof DOMException
          )
        )
          throw reason;
        console.log('状态查询暂时失败，保留原任务，稍后重查。');
      }
      console.log(klingProgressMessage(pipeline));
      if (pipeline.steps.some((step) => step.state === 'unknown'))
        throw new Error(
          `提交是否成功尚不确定。到 fal 历史核对任务，再用 --recover-step 和 --request-id 恢复；不会自动重发。状态：${stateFile}`
        );
      if (!pipeline.videoUrl && !pipeline.failureReason && !stopping)
        await pause(8_000);
    }
    const previewFile = path.join(path.dirname(stateFile), 'preview.html');
    await writeFile(previewFile, renderKlingTestPreview(pipeline), 'utf8');
    console.log(`检查页面：${previewFile}`);
    if (pipeline.failureReason)
      throw new Error(
        `生成失败：${pipeline.failureReason}。本命令不创建站内订单，也不返还 fal 费用。`
      );
    if (!pipeline.videoUrl)
      throw new Error(
        `已暂停等待，任务未取消。继续：pnpm test:video --resume "${stateFile}"`
      );
    console.log(
      '两段视频已在本地拼接并加入原音轨：finished.mp4。未执行成片检查。'
    );
  } finally {
    process.off('SIGINT', stop);
    await lock.close();
    const { unlink } = await import('node:fs/promises');
    await unlink(lockFile);
  }
}

runTest().catch((reason: unknown) => {
  // 不打印 SDK 原始响应或配置对象，避免密钥及签名照片链接进入终端日志。
  console.error(
    reason instanceof z.ZodError
      ? '参数或保存的任务结构无效，请检查输入；不会重新提交。'
      : reason instanceof Error
        ? reason.message
        : '测试失败，保留已有状态文件。'
  );
  process.exitCode = 1;
});
