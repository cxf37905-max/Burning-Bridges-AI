import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { creditsKeys, useCreditPurchaseSync } from '@/hooks/use-credits';

const fixtures = vi.hoisted(() => ({
  queryClient: undefined as QueryClient | undefined,
  queryOptions: undefined as unknown,
  balanceAction: vi.fn(),
  syncAction: vi.fn(),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...original,
    useQueryClient: () => fixtures.queryClient,
    useQuery: (options: unknown) => {
      fixtures.queryOptions = options;
      return {};
    },
  };
});
vi.mock('@/actions/get-credit-balance', () => ({
  getCreditBalanceAction: fixtures.balanceAction,
}));
vi.mock('@/actions/check-payment-sync', () => ({
  checkPaymentSyncAction: fixtures.syncAction,
}));
vi.mock('@/actions/consume-credits', () => ({ consumeCreditsAction: vi.fn() }));
vi.mock('@/actions/get-credit-stats', () => ({ getCreditStatsAction: vi.fn() }));
vi.mock('@/actions/get-credit-transactions', () => ({
  getCreditTransactionsAction: vi.fn(),
}));

function purchaseSyncQuery(userId: string | undefined = 'buyer') {
  useCreditPurchaseSync(userId, 'order-sync', {
    refetchInterval: 2000,
    refreshBalanceOnSync: true,
  });
  return fixtures.queryOptions as {
    queryFn: () => Promise<boolean>;
    enabled: boolean;
    refetchInterval: (query: { state: { data?: boolean } }) => number | false;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  fixtures.queryClient.setQueryData(creditsKeys.balance('buyer'), 20);
  fixtures.balanceAction.mockResolvedValue({
    data: { success: true, credits: 120 },
  });
});

afterEach(() => fixtures.queryClient?.clear());

describe('支付返回后的积分同步', () => {
  it('回调未到时继续等待，回调完成后更新共享余额，旧请求不能覆盖新余额', async () => {
    const client = fixtures.queryClient!;
    fixtures.syncAction
      .mockResolvedValueOnce({ data: { success: true, synced: false } })
      .mockResolvedValueOnce({ data: { success: true, synced: true } });
    const query = purchaseSyncQuery();
    expect(await query.queryFn()).toBe(false);
    expect(fixtures.balanceAction).not.toHaveBeenCalled();
    expect(query.refetchInterval({ state: { data: false } })).toBe(2000);

    let finishOldRequest!: (credits: number) => void;
    const oldRequest = client.fetchQuery({
      queryKey: creditsKeys.balance('buyer'),
      queryFn: () =>
        new Promise<number>((resolve) => {
          finishOldRequest = resolve;
        }),
    });
    const canceledRequest = expect(oldRequest).rejects.toBeDefined();
    expect(await query.queryFn()).toBe(true);
    finishOldRequest(20);
    await canceledRequest;
    expect(client.getQueryData(creditsKeys.balance('buyer'))).toBe(120);
    expect(query.refetchInterval({ state: { data: true } })).toBe(false);
  });

  it('余额读取失败不能宣告同步完成，下次查询可以恢复', async () => {
    fixtures.syncAction.mockResolvedValue({
      data: { success: true, synced: true },
    });
    fixtures.balanceAction.mockResolvedValueOnce({
      data: { success: false, error: '模拟余额读取失败' },
    });
    const query = purchaseSyncQuery();
    await expect(query.queryFn()).rejects.toThrow('模拟余额读取失败');
    expect(
      fixtures.queryClient!.getQueryData(creditsKeys.balance('buyer'))
    ).toBe(20);
    expect(await query.queryFn()).toBe(true);
    expect(
      fixtures.queryClient!.getQueryData(creditsKeys.balance('buyer'))
    ).toBe(120);
  });

  it('没有登录用户时禁用查询，不发起同步请求', async () => {
    const query = purchaseSyncQuery('');
    expect(query.enabled).toBe(false);
    await expect(query.queryFn()).rejects.toThrow('User ID is required');
    expect(fixtures.syncAction).not.toHaveBeenCalled();
  });
});
