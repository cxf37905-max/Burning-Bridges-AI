import { access, mkdtemp, rm } from 'node:fs/promises';
import { constants, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { getKlingTemplate } from './kling-templates';
import { assertFfmpegAvailable, runFfmpeg } from './ffmpeg-runner';
import { analyzeVideoSeam } from './video-seam-analysis';

function templateAudioFile(sceneId: string) {
  return path.resolve(
    'public/studio/reference',
    path.basename(new URL(getKlingTemplate(sceneId).audioUrl).pathname)
  );
}

export async function assertStudioCompositionAvailable(sceneId: string) {
  // 在扣积分和提交模型前确认本地依赖，缺文件时立即失败。
  await Promise.all([
    assertFfmpegAvailable(),
    access(templateAudioFile(sceneId), constants.R_OK),
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

export async function renderKlingVideoFiles(
  first: string,
  second: string,
  audio: string,
  sceneId: string,
  output: string,
  overlapFrames = 0
) {
  const { width, height, fps } = getKlingTemplate(sceneId);
  const normalize = `setpts=PTS-STARTPTS,fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=PTS-STARTPTS`;
  if (overlapFrames !== 0 && overlapFrames !== fps)
    throw new Error(`Unexpected overlap frame count: ${overlapFrames}`);
  const seam = overlapFrames
    ? await analyzeVideoSeam(first, second, sceneId, overlapFrames)
    : null;
  const firstTrim = seam ? `,trim=end_frame=${seam.firstEndFrame},setpts=PTS-STARTPTS` : '';
  const secondTrim = seam ? `,trim=start_frame=${seam.secondStartFrame},setpts=PTS-STARTPTS` : '';
  if (seam)
    console.info('studio.video.seam', { sceneId, overlapFrames, ...seam });
  await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    first,
    '-i',
    second,
    '-i',
    audio,
    '-filter_complex',
    `[0:v]${normalize}${firstTrim}[v0];[1:v]${normalize}${secondTrim}[v1];[v0][v1]concat=n=2:v=1:a=0[v]`,
    '-map',
    '[v]',
    '-map',
    '2:a:0',
    '-c:v',
    'libx264',
    '-r',
    String(fps),
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-threads',
    '2',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-movflags',
    '+faststart',
    output,
  ]);
}

export async function composeKlingVideo(
  first: string,
  second: string,
  sceneId: string,
  save: (filename: string) => Promise<string>,
  overlapFrames = 0
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'burning-bridges-'));
  const firstFile = path.join(directory, 'first.mp4');
  const secondFile = path.join(directory, 'second.mp4');
  const audioFile = templateAudioFile(sceneId);
  const output = path.join(directory, 'finished.mp4');
  try {
    // 重叠任务只分析接缝切点；分析失败交给原有本地合成重试，不重发模型。
    const downloads = await Promise.allSettled([
      downloadCompositionInput(first, firstFile),
      downloadCompositionInput(second, secondFile),
    ]);
    const failed = downloads.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    await renderKlingVideoFiles(
      firstFile,
      secondFile,
      audioFile,
      sceneId,
      output,
      overlapFrames
    );
    return await save(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
