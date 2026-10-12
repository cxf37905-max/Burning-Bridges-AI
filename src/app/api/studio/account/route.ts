import { getUserCredits } from '@/credits/credits';
import { getStudioUser } from '@/studio/auth';
import { getStudioAvailability } from '@/studio/availability';

export async function GET() {
  const { emailReady, googleReady } = getStudioAvailability();
  const auth = { email: emailReady, google: googleReady };
  const user = await getStudioUser();
  if (!user)
    return Response.json(
      { user: null, auth },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  const credits = await getUserCredits(user.id);
  return Response.json(
    {
      user: {
        name: user.name,
        email: user.email,
        image: user.image,
        credits,
      },
      auth,
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
