export interface SampledVideo {
  pixels: Buffer;
  width: number;
  height: number;
}

function frameAt(video: SampledVideo, index: number) {
  const bytes = video.width * video.height * 3;
  return video.pixels.subarray(index * bytes, (index + 1) * bytes);
}

function frameCount(video: SampledVideo) {
  const bytes = video.width * video.height * 3;
  if (video.pixels.length === 0 || video.pixels.length % bytes !== 0)
    throw new Error(`Invalid sampled video size: ${video.pixels.length} bytes.`);
  return video.pixels.length / bytes;
}

function cutScore(
  first: SampledVideo,
  second: SampledVideo,
  firstIndex: number,
  secondIndex: number
) {
  const before = frameAt(first, firstIndex - 1);
  const after = frameAt(first, firstIndex);
  const next = frameAt(second, secondIndex);
  const previous = frameAt(second, secondIndex - 1);
  let score = 0;
  let weights = 0;
  for (let y = 1; y < first.height - 1; y++) {
    for (let x = 1; x < first.width - 1; x++) {
      // 主角通常在中间；提高中央画面的权重，同时仍比较背景。
      const weight = x >= first.width / 4 && x < first.width * 3 / 4 ? 2 : 1;
      const offset = (y * first.width + x) * 3;
      for (let channel = 0; channel < 3; channel++) {
        const i = offset + channel;
        const appearance = Math.abs(after[i] - next[i]);
        const boundary = Math.abs(before[i] - next[i]);
        const motion = Math.abs((after[i] - before[i]) - (next[i] - previous[i]));
        const horizontalEdge = Math.abs(
          (after[i] - after[i - 3]) - (next[i] - next[i - 3])
        );
        const verticalEdge = Math.abs(
          (after[i] - after[i - first.width * 3]) -
          (next[i] - next[i - first.width * 3])
        );
        score += weight * (
          appearance + boundary + motion * 0.5 +
          (horizontalEdge + verticalEdge) * 0.5
        );
        weights += weight;
      }
    }
  }
  return score / weights;
}

export function selectVideoSeam(
  first: SampledVideo,
  second: SampledVideo,
  overlapFrames: number
) {
  if (
    first.width !== second.width || first.height !== second.height ||
    !Number.isSafeInteger(first.width) || !Number.isSafeInteger(first.height) ||
    first.width < 3 || first.height < 3 ||
    !Number.isSafeInteger(overlapFrames) || overlapFrames < 4
  )
    throw new Error(`Invalid seam sampling dimensions or overlap: ${overlapFrames}`);
  const firstFrames = frameCount(first);
  const secondFrames = frameCount(second);
  if (firstFrames <= overlapFrames || secondFrames <= overlapFrames)
    throw new Error(`Video too short for ${overlapFrames} overlap frames: ${firstFrames}, ${secondFrames}`);
  const overlapStart = firstFrames - overlapFrames;
  let secondStartFrame = Math.floor(overlapFrames / 2);
  let score = cutScore(first, second, overlapStart + secondStartFrame, secondStartFrame);
  // 同一原片时间点配对；两个裁剪点同步移动，始终只去掉24帧，不能随意跳过动作。
  for (let index = 2; index < overlapFrames - 1; index++) {
    const candidate = cutScore(first, second, overlapStart + index, index);
    if (candidate < score) {
      score = candidate;
      secondStartFrame = index;
    }
  }
  return {
    firstEndFrame: overlapStart + secondStartFrame,
    secondStartFrame,
    score,
    outputFrames: firstFrames + secondFrames - overlapFrames,
  };
}
