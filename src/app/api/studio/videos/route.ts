import { getStudioUser } from '@/studio/auth';
import { getStudioAvailability } from '@/studio/availability';
import {
  generationInput,
  readGenerationForm,
  InvalidUploadError,
} from '@/studio/generation-validation';
import {
  normalizeStudioPhoto,
  InvalidPhotoError,
} from '@/studio/photo-storage';
import {
  createStudioVideo,
  publicVideoJob,
  VideoRequestError,
} from '@/studio/video-jobs';

export const maxDuration = 120;

export async function POST(request: Request) {
  const origin = new URL(
    process.env.NEXT_PUBLIC_BASE_URL || 'https://burningbridgesai.cc'
  ).origin;
  if (request.headers.get('origin') !== origin)
    return Response.json(
      { error: 'Request origin is not allowed.' },
      { status: 403 }
    );
  const user = await getStudioUser();
  if (!user)
    return Response.json(
      { error: 'Sign in to create your video.' },
      { status: 401 }
    );
  if (!getStudioAvailability().generationReady)
    return Response.json(
      { error: 'Video generation is not open yet.' },
      { status: 503 }
    );
  let picture: Buffer;
  let input;
  try {
    const form = await readGenerationForm(request);
    const parsed = generationInput.safeParse({
      requestId: form.get('requestId'),
      sceneId: form.get('sceneId'),
      consent: form.get('consent'),
    });
    if (!parsed.success)
      return Response.json(
        {
          error: 'Choose a scene, accept the terms, and complete verification.',
        },
        { status: 400 }
      );
    input = parsed.data;
    const photo = form.get('photo');
    if (!(photo instanceof File))
      throw new InvalidPhotoError('Choose a photo before creating a video.');
    picture = await normalizeStudioPhoto(photo);
  } catch (reason) {
    if (
      reason instanceof InvalidPhotoError ||
      reason instanceof InvalidUploadError
    )
      return Response.json({ error: reason.message }, { status: 400 });
    if (reason instanceof TypeError)
      return Response.json(
        { error: 'The upload form is invalid.' },
        { status: 400 }
      );
    throw reason;
  }
  try {
    const video = await createStudioVideo(
      user.id,
      input.requestId,
      input.sceneId,
      picture
    );
    return Response.json(publicVideoJob(video), {
      status: 202,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (reason) {
    if (reason instanceof VideoRequestError)
      return Response.json(
        { error: reason.message },
        { status: reason.status }
      );
    throw reason;
  }
}
