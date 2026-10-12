import { describe, expect, it } from 'vitest';
import { checkoutInput } from '../../src/studio/payment-validation';

describe('结账请求边界', () => {
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
});
