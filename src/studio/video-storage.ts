import 'server-only';
import { readFile } from 'node:fs/promises';
import { composeKlingVideo } from './video-composition';
import { storeR2Object } from './r2-storage';

export async function composeStudioVideo(
  jobId: string,
  first: string,
  second: string,
  sceneId: string
) {
  return composeKlingVideo(first, second, sceneId, async (filename) =>
    storeR2Object(
      `studio-results/${jobId}.mp4`,
      await readFile(filename),
      'video/mp4',
      604800
    )
  );
}
