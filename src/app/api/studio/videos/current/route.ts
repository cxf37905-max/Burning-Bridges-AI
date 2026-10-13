import { getStudioUser } from '@/studio/auth';
import { readCurrentStudioVideo } from '@/studio/current-video';

export async function GET() {
  const user = await getStudioUser();
  if (!user)
    return Response.json(
      { error: 'Sign in to restore your studio.' },
      { status: 401 }
    );
  return Response.json(
    { video: await readCurrentStudioVideo(user.id) },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
