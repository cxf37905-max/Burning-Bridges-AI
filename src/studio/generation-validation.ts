import { z } from 'zod';
import { MAX_PHOTO_BYTES } from './photo-validation';

export class InvalidUploadError extends Error {}

export const generationInput = z
  .object({
    requestId: z.uuid(),
    sceneId: z.enum(['chandelier', 'after-hours']),
    consent: z.literal('true'),
  })
  .strict();

export async function readGenerationForm(request: Request) {
  const limit = MAX_PHOTO_BYTES + 1024 * 1024;
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidUploadError('Photo upload body is required.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      throw new InvalidUploadError('Photo upload exceeds 21 MB.');
    }
    chunks.push(chunk.value);
  }
  return new Response(new Blob(chunks as BlobPart[]), {
    headers: { 'Content-Type': request.headers.get('content-type') || '' },
  }).formData();
}
