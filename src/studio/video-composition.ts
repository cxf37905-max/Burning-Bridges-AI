import { access, mkdtemp, rm } from 'node:fs/promises';
import { constants, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { getKlingTemplate } from './kling-templates';
import { assertFfmpegAvailable, runFfmpeg } from './ffmpeg-runner';
export async function assertStudioCompositionAvailable(sceneId: string) {
  // 在扣积分和提交模型前确认本地依赖，缺文件时立即失败。
  await Promise.all([
    assertFfmpegAvailable(),
    access(path.resolve('public/studio/reference', getKlingTemplate(sceneId).singleReference.audioFilename), constants.R_OK),
  ]);
}

async function* downloadChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  let received = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return;
      received += chunk.value.byteLength;
      if (received > 200 * 1024 * 1024)
        throw new Error('Composition input exceeds 200MB.');
      yield chunk.value;
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

async function downloadCompositionInput(address: string, destination: string) {
  const url = new URL(address);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !(url.hostname.endsWith('.fal.media') || url.hostname === 'fal.media')
  )
    throw new Error(
      'Composition input must use the configured media provider.'
    );
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok || !response.body)
    throw new Error(`Composition download failed: HTTP ${response.status}`);
  await streamPipeline(
    Readable.from(downloadChunks(response.body)),
    createWriteStream(destination, { flags: 'wx' })
  );
}

export async function finishSingleKlingVideo(
  videoUrl: string,
  sceneId: string,
  save: (filename: string) => Promise<string>
) {
  const template = getKlingTemplate(sceneId);
  const directory = await mkdtemp(path.join(tmpdir(), 'burning-bridges-single-'));
  const source = path.join(directory, 'source.mp4');
  const output = path.join(directory, 'finished.mp4');
  try {
    await downloadCompositionInput(videoUrl, source);
    await runFfmpeg([
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
      '-i', source,
      '-i', path.resolve('public/studio/reference', template.singleReference.audioFilename),
      '-map', '0:v:0', '-map', '1:a:0',
      '-vf', `fps=${template.fps},scale=${template.width}:${template.height}:force_original_aspect_ratio=decrease,pad=${template.width}:${template.height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
      '-t', String(template.singleReference.seconds),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-threads', '2',
      '-c:a', 'aac', '-b:a', '192k', '-shortest',
      '-movflags', '+faststart', output,
    ]);
    return await save(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
