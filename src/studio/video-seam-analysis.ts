import { readFfmpegOutput } from './ffmpeg-runner';
import { getKlingTemplate } from './kling-templates';
import { selectVideoSeam } from './video-seam';

export async function analyzeVideoSeam(
  first: string,
  second: string,
  sceneId: string,
  overlapFrames: number
) {
  const { width, height, fps } = getKlingTemplate(sceneId);
  const sampleWidth = width < height ? 64 : 114;
  const sampleHeight = width < height ? 114 : 64;
  // O3 单段上限15秒；额外一秒仅作解码取整容量，超出时明确报错。
  const maxFrames = 16 * fps;
  const maxBytes = maxFrames * sampleWidth * sampleHeight * 3;
  const filter = `setpts=PTS-STARTPTS,fps=${fps},scale=${sampleWidth}:${sampleHeight}:force_original_aspect_ratio=decrease,pad=${sampleWidth}:${sampleHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=rgb24`;
  const samples = await Promise.allSettled([first, second].map((filename) =>
    readFfmpegOutput([
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', filename,
      '-map', '0:v:0', '-an', '-vf', filter,
      '-frames:v', String(maxFrames + 1), '-f', 'rawvideo', 'pipe:1',
    ], maxBytes)
  ));
  const [firstSample, secondSample] = samples;
  if (firstSample.status === 'rejected') throw firstSample.reason;
  if (secondSample.status === 'rejected') throw secondSample.reason;
  return selectVideoSeam(
    { pixels: firstSample.value, width: sampleWidth, height: sampleHeight },
    { pixels: secondSample.value, width: sampleWidth, height: sampleHeight },
    overlapFrames
  );
}
