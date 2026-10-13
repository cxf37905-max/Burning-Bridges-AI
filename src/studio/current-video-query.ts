import { z } from 'zod';

const currentVideoResponse = z.object({
  video: z
    .object({
      id: z.string().regex(/^[a-f0-9]{32}$/),
      sceneId: z.enum(['chandelier', 'after-hours']),
    })
    .nullable(),
});

export async function fetchCurrentStudioVideo([url]: readonly [string, string]) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok)
    throw new Error(
      'Your studio could not be restored. Open My videos to continue.'
    );
  return currentVideoResponse.parse(await response.json());
}
