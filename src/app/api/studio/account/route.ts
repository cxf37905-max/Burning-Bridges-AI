import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { userCredit } from '@/db/schema';
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
  const db = await getDb();
  const [wallet] = await db
    .select({ credits: userCredit.currentCredits })
    .from(userCredit)
    .where(eq(userCredit.userId, user.id));
  return Response.json(
    { user: { name: user.name, credits: wallet?.credits || 0 }, auth },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
