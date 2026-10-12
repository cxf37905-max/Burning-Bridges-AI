import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import type { PaymentNotification } from '@waffo/waffo-node';
import { getDb } from '@/db';
import { studioOrder } from '@/db/schema';
import { addPurchasedCreditsInTransaction } from '@/credits/credits';
import { videoCreditCost } from './catalog';
import { assertPaidOrder } from './payment-validation';
import { getWaffoClient } from './waffo';

export async function fulfillVideoPayment(notification: PaymentNotification) {
  const id = notification.result?.paymentRequestId;
  if (!id) throw new Error('Waffo paymentRequestId is missing.');
  const db = await getDb();
  const [order] = await db
    .select()
    .from(studioOrder)
    .where(eq(studioOrder.id, id));
  if (!order) throw new Error(`Unknown studio order: ${id}`);
  // 回调只作为查询触发器，付款事实以签名验证后的主动查询为准。
  const response = await getWaffoClient()
    .order()
    .inquiry({ paymentRequestId: id });
  if (!response.isSuccess())
    throw new Error(`Waffo order inquiry failed: ${id}`);
  const payment = response.getData();
  if (!payment) throw new Error(`Waffo inquiry returned no data: ${id}`);
  if (payment.orderStatus !== 'PAY_SUCCESS') {
    if (payment.orderStatus === 'ORDER_CLOSE')
      await db
        .update(studioOrder)
        .set({ status: 'closed' })
        .where(and(eq(studioOrder.id, id), isNull(studioOrder.fulfilledAt)));
    return;
  }
  assertPaidOrder(order, payment);
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(studioOrder)
      .set({
        status: 'paid',
        fulfilledAt: new Date(),
        acquiringOrderId: payment.acquiringOrderId,
      })
      .where(and(eq(studioOrder.id, id), isNull(studioOrder.fulfilledAt)))
      .returning();
    if (!claimed) return;
    await addPurchasedCreditsInTransaction(tx, {
      userId: claimed.userId,
      amount: claimed.videos * videoCreditCost,
      orderId: claimed.id,
    });
  });
}
