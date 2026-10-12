import 'server-only';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { websiteConfig } from '@/config/website';
import { getCreditPackageById } from '@/credits/server';
import { createCreditCheckout } from '@/payment';
import { findVideoPack, studioBrand } from './catalog';

export async function createVideoCheckout(
  user: { id: string; email: string },
  packId: string,
  requestId: string
) {
  const pack = findVideoPack(packId);
  if (!pack) throw new Error(`视频套餐不存在：${packId}`);
  if (websiteConfig.payment.provider !== 'waffo')
    throw new Error('本站视频积分包需要启用 Waffo Pancake 支付。');
  const creditPack = getCreditPackageById(pack.creditPackageId);
  if (!creditPack?.price.priceId)
    throw new Error(`尚未配置 Waffo 产品 ID：${pack.creditPackageId}`);
  const id = createHash('sha256')
    .update(`${user.id}:${requestId}`)
    .digest('hex')
    .slice(0, 32);
  const db = await getDb();
  const [existing] = await db.select().from(payment).where(eq(payment.id, id));
  if (
    existing &&
    (existing.userId !== user.id ||
      existing.priceId !== creditPack.price.priceId)
  )
    throw new Error(`结账请求与已有支付记录不一致：${id}`);
  if (existing && (existing.paid || existing.status !== 'incomplete'))
    throw new Error(`此支付请求已处理，请重新选择套餐：${id}`);
  const origin = new URL(process.env.NEXT_PUBLIC_BASE_URL || studioBrand.url)
    .origin;
  // 付款、验签、查单和积分入账全部交给模板的支付接口。
  const result = await createCreditCheckout({
    packageId: creditPack.id,
    priceId: creditPack.price.priceId,
    customerEmail: user.email,
    successUrl: `${origin}/?checkout=returned#studio`,
    cancelUrl: `${origin}/pricing?checkout=cancelled`,
    locale: 'en',
    metadata: { userId: user.id, paymentSyncId: id },
  });
  return { url: result.url, orderId: id };
}
