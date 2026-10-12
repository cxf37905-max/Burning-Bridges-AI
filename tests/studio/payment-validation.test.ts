import { describe, expect, it } from 'vitest';
import {
  assertPaidOrder,
  checkoutInput,
  checkoutUrl,
  parseUsdCents,
} from '../../src/studio/payment-validation';

const order = {
  id: 'merchant-order',
  cents: 1990,
  currency: 'USD',
  acquiringOrderId: 'acq-order',
};
const payment = {
  paymentRequestId: order.id,
  merchantOrderId: order.id,
  acquiringOrderId: 'acq-order',
  orderAmount: '19.90',
  orderCurrency: 'USD',
  orderStatus: 'PAY_SUCCESS',
};

describe('Waffo 付款边界', () => {
  it('金额按十进制解析，拒绝指数、负数和超精度', () => {
    expect(parseUsdCents('19.90')).toBe(1990);
    expect(parseUsdCents('9.9')).toBe(990);
    for (const value of ['1e3', '-1.00', '0.001', '', undefined])
      expect(() => parseUsdCents(value)).toThrow();
  });
  it('只接受服务端套餐标识，不接受客户端价格和用户身份', () => {
    const valid = {
      packId: 'single',
      requestId: '22dbba13-2bb5-44f9-9df3-b270ef74e7c6',
    };
    expect(checkoutInput.safeParse(valid).success).toBe(true);
    expect(checkoutInput.safeParse({ ...valid, cents: 1 }).success).toBe(false);
    expect(
      checkoutInput.safeParse({ ...valid, userId: 'victim' }).success
    ).toBe(false);
    expect(
      checkoutInput.safeParse({ ...valid, packId: 'unknown' }).success
    ).toBe(false);
  });
  it('解析真实 orderAction JSON，仅接受 Waffo HTTPS 浏览器收银台', () => {
    expect(
      checkoutUrl(
        JSON.stringify({
          actionType: 'REDIRECT',
          webUrl: 'https://cashier.waffo.com/pay/123',
        })
      )
    ).toContain('cashier.waffo.com');
    for (const webUrl of [
      'javascript:alert(1)',
      'https://waffo.com.evil.test/pay',
      'http://cashier.waffo.com',
      'https://user:pass@cashier.waffo.com',
    ])
      expect(() =>
        checkoutUrl(JSON.stringify({ actionType: 'REDIRECT', webUrl }))
      ).toThrow();
    expect(() =>
      checkoutUrl(
        JSON.stringify({
          actionType: 'DEEPLINK',
          webUrl: 'https://cashier.waffo.com',
        })
      )
    ).toThrow();
    expect(() => checkoutUrl('https://cashier.waffo.com')).toThrow();
    expect(() => checkoutUrl(undefined)).toThrow();
  });
  it('回调不能用错误身份、金额、币种或未付款状态发放额度', () => {
    expect(() => assertPaidOrder(order, payment)).not.toThrow();
    for (const difference of [
      { orderStatus: 'PAY_IN_PROGRESS' },
      { merchantOrderId: 'other' },
      { paymentRequestId: 'other' },
      { acquiringOrderId: 'other' },
      { orderAmount: '0.01' },
      { orderCurrency: 'HKD' },
    ])
      expect(() =>
        assertPaidOrder(order, { ...payment, ...difference })
      ).toThrow();
  });
});
