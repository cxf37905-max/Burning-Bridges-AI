import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getKlingTemplate } from './kling-templates';
import { photoRetentionSeconds } from './media-retention';
import { storeR2Object } from './r2-storage';
import { assertStudioCompositionAvailable } from './video-composition';
import { assertFalWebhookConfigured } from './fal-webhook-url';

export async function storeStudioReference(jobId: string, sceneId: string) {
  const { overlapReference } = getKlingTemplate(sceneId);
  assertFalWebhookConfigured();
  await assertStudioCompositionAvailable(sceneId);
  // 与输入照片采用同一私有前缀和24小时清理规则；上传失败时尚未扣积分。
  const secondReferenceUrl = await storeR2Object(
    `studio-inputs/${jobId}-reference.mp4`,
    await readFile(
      path.resolve('public/studio/reference', overlapReference.filename)
    ),
    'video/mp4',
    photoRetentionSeconds
  );
  return { secondReferenceUrl, overlapFrames: overlapReference.frames };
}
