import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getUserCredits } from '@/credits/credits';
import { getDb } from '@/db';
import { payment, studioVideo, creditTransaction } from '@/db/schema';
import { findPaymentPriceKey, paymentProviderLabels } from '@/config/website';
import { PaymentScenes } from '@/payment/types';
import { videoPacks } from './catalog';
import { getStudioUser } from './auth';

export async function readStudioAccountRecords() {
  const user = await getStudioUser();
  if (!user) redirect('/auth/login?callbackUrl=/dashboard');
  const db = await getDb();
  const balance = await getUserCredits(user.id);
  const [payments, videos, transactions] = await Promise.all([
    db
      .select({
        id: payment.id,
        priceId: payment.priceId,
        status: payment.status,
        paid: payment.paid,
        invoiceId: payment.invoiceId,
        fulfilledAt: payment.webhookProcessedAt,
        createdAt: payment.createdAt,
      })
      .from(payment)
      .where(
        and(
          eq(payment.userId, user.id),
          eq(payment.scene, PaymentScenes.CREDIT)
        )
      )
      .orderBy(desc(payment.createdAt))
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
  const orders = payments.map((record) => {
    const configuredPrice = findPaymentPriceKey(record.priceId);
    const key = configuredPrice?.key;
    const packageId = key?.replace(/^credits/, '').toLowerCase();
    const pack = videoPacks.find((item) => item.creditPackageId === packageId);
    if (!pack || !configuredPrice)
      throw new Error(`账单对应的视频套餐不存在：${record.priceId}`);
    let status = 'pending';
    if (record.paid) status = 'paid';
    else if (record.status === 'canceled' && record.invoiceId)
      status = 'refunded';
    else if (
      ['canceled', 'incomplete_expired', 'failed'].includes(record.status)
    )
      status = 'closed';
    return {
      id: record.id,
      providerLabel: paymentProviderLabels[configuredPrice.provider],
      packId: pack.id,
      videos: pack.videos,
      cents: pack.cents,
      currency: 'USD',
      status,
      fulfilledAt: record.fulfilledAt,
      createdAt: record.createdAt,
    };
  });
  return {
    user,
    balance,
    orders,
    videos,
    transactions,
  };
}
export type StudioAccountRecords = Awaited<
  ReturnType<typeof readStudioAccountRecords>
>;
