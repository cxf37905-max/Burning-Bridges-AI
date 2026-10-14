import 'server-only';
import { readFile } from 'node:fs/promises';
import { finishSingleKlingVideo } from './video-composition';
import { storeR2Object } from './r2-storage';

async function saveStudioVideo(jobId: string, filename: string) {
  return storeR2Object(
    `studio-results/${jobId}.mp4`,
    await readFile(filename),
    'video/mp4',
    604800
  );
}

export async function finishStudioVideo(jobId: string, video: string, sceneId: string) {
  return finishSingleKlingVideo(video, sceneId, (filename) => saveStudioVideo(jobId, filename));
}
