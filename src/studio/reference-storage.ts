import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getKlingTemplate } from './kling-templates';
import { photoRetentionSeconds } from './media-retention';
import { storeR2Object } from './r2-storage';
import { assertStudioCompositionAvailable } from './video-composition';
import { assertFalWebhookConfigured } from './fal-webhook-url';

export async function storeStudioReference(jobId: string, sceneId: string) {
  const { singleReference } = getKlingTemplate(sceneId);
  assertFalWebhookConfigured();
  await assertStudioCompositionAvailable(sceneId);
  // 与输入照片共用私有前缀；R2生命周期满1天到期删除，上传失败时尚未扣积分。
  const referenceVideoUrl = await storeR2Object(
    `studio-inputs/${jobId}-reference.mp4`,
    await readFile(
      path.resolve('public/studio/reference', singleReference.filename)
    ),
    'video/mp4',
    photoRetentionSeconds
  );
  return { referenceVideoUrl };
}
