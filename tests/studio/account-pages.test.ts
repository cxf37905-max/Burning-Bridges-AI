import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({ user: vi.fn(), records: vi.fn() }));
vi.mock('@/studio/auth', () => ({ getStudioUser: dependencies.user }));
vi.mock('@/studio/account-records', () => ({
  readStudioAccountRecords: dependencies.records,
}));
vi.mock('@/components/studio/studio-account', () => ({
  StudioAccount: () => null,
}));
vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  usePathname: () => '/settings/credits',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
import AccountLayout from '../../src/app/[locale]/(protected)/layout';
import CreditsPage from '../../src/app/[locale]/(protected)/settings/credits/page';
import BillingPage from '../../src/app/[locale]/(protected)/settings/billing/page';

const owner = {
  id: 'account-preview',
  name: 'Alex',
  email: 'alex@example.com',
};
const records = {
  user: owner,
  balance: 250,
  videos: [],
  orders: [
    {
      id: 'waffo-preview-order',
      providerLabel: 'Waffo',
      videos: 3,
      cents: 1990,
      currency: 'USD',
      status: 'paid',
      createdAt: new Date('2026-10-12T00:00:00Z'),
    },
  ],
  transactions: [
    {
      id: 'preview-debit',
      description: 'Burning Bridges AI video',
      amount: -100,
      type: 'USAGE',
      reference: 'preview-video',
      createdAt: new Date('2026-10-12T00:00:00Z'),
    },
  ],
};

describe('账户页使用统一积分与登录守卫', () => {
  it('没有服务端会话时拒绝渲染账户内容', async () => {
    dependencies.user.mockResolvedValue(null);
    await expect(
      AccountLayout({ children: createElement('p', null, 'Private account') })
    ).rejects.toThrow('NEXT_REDIRECT');
  });
  it('积分页直接显示原表积分与真实消费流水，不再次乘100', async () => {
    dependencies.user.mockResolvedValue(owner);
    dependencies.records.mockResolvedValue(records);
    const markup = renderToStaticMarkup(
      await AccountLayout({ children: await CreditsPage() })
    );
    expect(markup).toContain('250 <small>credits</small>');
    expect(markup).toContain('-100');
    expect(markup).toContain('Credit history');
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain('25000');
  });
  it('账单展示Waffo订单金额、购买积分和付款状态', async () => {
    dependencies.records.mockResolvedValue(records);
    const markup = renderToStaticMarkup(await BillingPage());
    expect(markup).toContain('waffo-preview-order');
    expect(markup).toContain('300');
    expect(markup).toContain('$19.90');
    expect(markup).toContain('Paid');
    expect(markup).not.toContain('Stripe');
  });
});
