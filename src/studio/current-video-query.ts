import { z } from 'zod';
import { publicVideoJobSchema } from './video-job-contract';

const currentVideoResponse = z.object({
  video: publicVideoJobSchema.nullable(),
});

export async function fetchCurrentStudioVideo([url]: readonly [string, string]) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok)
    throw new Error(
      'Your studio could not be restored. Open My videos to continue.'
    );
  return currentVideoResponse.parse(await response.json());
}
