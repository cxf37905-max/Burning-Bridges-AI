import { describe, expect, it, vi } from 'vitest';
const getDb = vi.hoisted(() => vi.fn());
vi.mock('../../src/db', () => ({ getDb }));
import { websiteConfig } from '../../src/config/website';
import {
  addCredits,
  addLifetimeMonthlyCredits,
  addMonthlyFreeCredits,
  addRegisterGiftCredits,
  addSubscriptionCredits,
} from '../../src/credits/credits';
import {
  batchAddLifetimeMonthlyCredits,
  batchAddMonthlyFreeCredits,
  batchAddYearlyUsersMonthlyCredits,
  distributeCreditsToAllUsers,
} from '../../src/credits/distribute';

describe('只允许购买获得新积分', () => {
  it('启用正常积分系统时，所有自动发放入口仍不会操作数据库', async () => {
    expect(websiteConfig.credits.enableCredits).toBe(true);
    expect(websiteConfig.credits.registerGiftCredits).toMatchObject({
      enable: false,
      amount: 0,
    });
    await addRegisterGiftCredits('new-user');
    await addMonthlyFreeCredits('new-user', 'free');
    await addSubscriptionCredits('new-user', 'old-price');
    await addLifetimeMonthlyCredits('new-user', 'old-price');
    await batchAddMonthlyFreeCredits(['new-user']);
    await batchAddLifetimeMonthlyCredits([
      { userId: 'new-user', priceId: 'old-price' },
    ]);
    await batchAddYearlyUsersMonthlyCredits([
      { userId: 'new-user', priceId: 'old-price' },
    ]);
    expect(await distributeCreditsToAllUsers()).toMatchObject({
      processedCount: 0,
    });
    expect(getDb).not.toHaveBeenCalled();
  });
  it.each([
    'REGISTER_GIFT',
    'MONTHLY_REFRESH',
    'SUBSCRIPTION_RENEWAL',
    'LIFETIME_MONTHLY',
    'REFUND',
  ])('公开赠送入口拒绝 %s 类型', async (type) => {
    await expect(
      addCredits({
        userId: 'new-user',
        amount: 100,
        type,
        description: 'Rejected grant',
        idempotencyKey: 'invalid:' + type,
      })
    ).rejects.toThrow('Only verified purchases');
    expect(getDb).not.toHaveBeenCalled();
  });
});
