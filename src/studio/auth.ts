import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { user } from '@/db/schema';
import { getStudioAvailability } from './availability';

export async function getStudioUser() {
  if (!getStudioAvailability().authReady) return null;
  const { getSession } = await import('@/lib/server');
  const session = await getSession();
  if (!session?.user?.id) return null;
  const db = await getDb();
  const [record] = await db
    .select({ banned: user.banned, banExpires: user.banExpires })
    .from(user)
    .where(eq(user.id, session.user.id));
  if (
    !record ||
    (record.banned && (!record.banExpires || record.banExpires > new Date()))
  )
    return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
  };
}
