import { mkdtemp, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { getKlingTemplate } from './kling-templates';
import { runFfmpeg } from './ffmpeg-runner';

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
  output: string
) {
  const { width, height, fps } = getKlingTemplate(sceneId);
  const normalize = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},setsar=1,setpts=PTS-STARTPTS`;
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
    `[0:v]${normalize}[v0];[1:v]${normalize}[v1];[v0][v1]concat=n=2:v=1:a=0[v]`,
    '-map',
    '[v]',
    '-map',
    '2:a:0',
    '-c:v',
    'libx264',
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
  save: (filename: string) => Promise<string>
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'burning-bridges-'));
  const firstFile = path.join(directory, 'first.mp4');
  const secondFile = path.join(directory, 'second.mp4');
  const audioFile = path.resolve(
    'public/studio/reference',
    path.basename(new URL(getKlingTemplate(sceneId).audioUrl).pathname)
  );
  const output = path.join(directory, 'finished.mp4');
  try {
    // 仅获取合成输入，不做元数据或成片质量检查。
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
      output
    );
    return await save(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
