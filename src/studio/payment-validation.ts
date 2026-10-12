import { z } from 'zod';

export const checkoutInput = z
  .object({
    packId: z.enum(['single', 'trio', 'creator']),
    requestId: z.uuid(),
  })
  .strict();

export function parseUsdCents(value: string | undefined) {
  if (!value || !/^\d{1,9}(\.\d{1,2})?$/.test(value))
    throw new Error(`Invalid USD amount: ${String(value)}`);
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function assertCheckoutUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
    throw new Error('Waffo checkout URL must use HTTPS without credentials.');
  const allowed = ['waffo.com', 'waffo.ai'];
  if (
    !allowed.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    )
  )
    throw new Error(`Unexpected Waffo checkout host: ${parsed.hostname}`);
  return parsed.toString();
}

export function checkoutUrl(action: string | undefined) {
  if (!action) throw new Error('Waffo orderAction is missing.');
  const parsed = z
    .object({ actionType: z.string(), webUrl: z.url() })
    .parse(JSON.parse(action));
  // 本站使用浏览器托管收银台，不直接启动钱包应用的 deeplink。
  if (parsed.actionType === 'DEEPLINK')
    throw new Error(
      'Waffo returned a deeplink instead of a hosted web checkout.'
    );
  return assertCheckoutUrl(parsed.webUrl);
}

export function assertPaidOrder(
  order: {
    id: string;
    cents: number;
    currency: string;
    acquiringOrderId: string | null;
  },
  payment: {
    paymentRequestId?: string;
    merchantOrderId?: string;
    acquiringOrderId?: string;
    orderAmount?: string;
    orderCurrency?: string;
    orderStatus?: string;
  }
) {
  if (payment.orderStatus !== 'PAY_SUCCESS')
    throw new Error(`Order is not paid: ${String(payment.orderStatus)}`);
  if (
    payment.paymentRequestId !== order.id ||
    payment.merchantOrderId !== order.id
  )
    throw new Error(`Payment identity mismatch for order ${order.id}`);
  if (
    !payment.acquiringOrderId ||
    (order.acquiringOrderId &&
      order.acquiringOrderId !== payment.acquiringOrderId)
  )
    throw new Error(`Acquiring order mismatch for ${order.id}`);
  if (
    payment.orderCurrency !== order.currency ||
    parseUsdCents(payment.orderAmount) !== order.cents
  )
    throw new Error(
      `Payment amount or currency mismatch for order ${order.id}`
    );
}
