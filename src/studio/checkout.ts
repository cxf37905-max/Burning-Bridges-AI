import 'server-only';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { studioOrder } from '@/db/schema';
import { findVideoPack, studioBrand } from './catalog';
import { assertCheckoutUrl, checkoutUrl } from './payment-validation';
import { getWaffoClient } from './waffo';

export async function createVideoCheckout(
  user: { id: string; email: string },
  packId: string,
  requestId: string
) {
  const pack = findVideoPack(packId);
  if (!pack) throw new Error(`Unknown video pack: ${packId}`);
  const id = createHash('sha256')
    .update(`${user.id}:${requestId}`)
    .digest('hex')
    .slice(0, 32);
  const db = await getDb();
  await db
    .insert(studioOrder)
    .values({
      id,
      userId: user.id,
      packId,
      cents: pack.cents,
      videos: pack.videos,
    })
    .onConflictDoNothing();
  const [order] = await db
    .select()
    .from(studioOrder)
    .where(eq(studioOrder.id, id));
  if (!order) throw new Error(`Studio order was not created: ${id}`);
  if (order.userId !== user.id || order.packId !== packId)
    throw new Error(`Checkout idempotency conflict for order ${id}`);
  if (order.status !== 'pending')
    throw new Error(`Checkout is already ${order.status}: ${id}`);
  if (order.checkoutUrl)
    return { url: assertCheckoutUrl(order.checkoutUrl), orderId: id };
  const origin = new URL(process.env.NEXT_PUBLIC_BASE_URL || studioBrand.url)
    .origin;
  const response = await getWaffoClient()
    .order()
    .create({
      paymentRequestId: id,
      merchantOrderId: id,
      orderAmount: (order.cents / 100).toFixed(2),
      orderCurrency: order.currency,
      orderDescription: `${studioBrand.name} — ${pack.name}`,
      notifyUrl: `${origin}/api/studio/waffo-webhook`,
      successRedirectUrl: `${origin}/?checkout=returned#studio`,
      failedRedirectUrl: `${origin}/pricing?checkout=failed`,
      cancelRedirectUrl: `${origin}/pricing?checkout=cancelled`,
      userInfo: { userId: user.id, userEmail: user.email, userTerminal: 'WEB' },
      paymentInfo: { productName: 'ONE_TIME_PAYMENT' },
      goodsInfo: {
        goodsName: `${pack.videos} Burning Bridges AI videos`,
        goodsUrl: `${origin}/pricing`,
      },
    });
  if (!response.isSuccess()) throw new Error(`Waffo rejected order ${id}`);
  const result = response.getData();
  if (!result) throw new Error(`Waffo returned no data for order ${id}`);
  const url = checkoutUrl(result.orderAction);
  if (!result.acquiringOrderId)
    throw new Error(`Waffo acquiring order ID missing for ${id}`);
  await db
    .update(studioOrder)
    .set({ acquiringOrderId: result.acquiringOrderId, checkoutUrl: url })
    .where(eq(studioOrder.id, id));
  return { url, orderId: id };
}
