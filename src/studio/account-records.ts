import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import {
  studioOrder,
  studioVideo,
  userCredit,
  creditTransaction,
} from '@/db/schema';
import { getStudioUser } from './auth';

export async function readStudioAccountRecords() {
  const user = await getStudioUser();
  if (!user) redirect('/auth/login?callbackUrl=/dashboard');
  const db = await getDb();
  const [wallets, orders, videos, transactions] = await Promise.all([
    db
      .select({ credits: userCredit.currentCredits })
      .from(userCredit)
      .where(eq(userCredit.userId, user.id)),
    db
      .select({
        id: studioOrder.id,
        packId: studioOrder.packId,
        videos: studioOrder.videos,
        cents: studioOrder.cents,
        currency: studioOrder.currency,
        status: studioOrder.status,
        fulfilledAt: studioOrder.fulfilledAt,
        createdAt: studioOrder.createdAt,
      })
      .from(studioOrder)
      .where(eq(studioOrder.userId, user.id))
      .orderBy(desc(studioOrder.createdAt))
      .limit(100),
    db
      .select({
        id: studioVideo.id,
        sceneId: studioVideo.sceneId,
        status: studioVideo.status,
        refundedAt: studioVideo.refundedAt,
        createdAt: studioVideo.createdAt,
      })
      .from(studioVideo)
      .where(eq(studioVideo.userId, user.id))
      .orderBy(desc(studioVideo.createdAt))
      .limit(100),
    db
      .select({
        id: creditTransaction.id,
        description: creditTransaction.description,
        amount: creditTransaction.amount,
        reference: creditTransaction.paymentId,
        createdAt: creditTransaction.createdAt,
        type: creditTransaction.type,
      })
      .from(creditTransaction)
      .where(eq(creditTransaction.userId, user.id))
      .orderBy(desc(creditTransaction.createdAt))
      .limit(100),
  ]);
  return {
    user,
    balance: wallets[0]?.credits || 0,
    orders,
    videos,
    transactions,
  };
}
export type StudioAccountRecords = Awaited<
  ReturnType<typeof readStudioAccountRecords>
>;
