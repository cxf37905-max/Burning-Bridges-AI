import { consumeCreditsAction } from '@/actions/consume-credits';
import { checkPaymentSyncAction } from '@/actions/check-payment-sync';
import { getCreditBalanceAction } from '@/actions/get-credit-balance';
import { getCreditStatsAction } from '@/actions/get-credit-stats';
import { getCreditTransactionsAction } from '@/actions/get-credit-transactions';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';

// Simple filter interface
interface SimpleFilter {
  id: string;
  value: string;
}

type CreditQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

// Query keys
export const creditsKeys = {
  all: ['credits'] as const,
  balance: (userId: string) => [...creditsKeys.all, 'balance', userId] as const,
  stats: (userId: string) => [...creditsKeys.all, 'stats', userId] as const,
  purchaseSync: (userId: string, syncId: string) =>
    [...creditsKeys.all, 'purchaseSync', userId, syncId] as const,
  transactions: (userId: string) =>
    [...creditsKeys.all, 'transactions', userId] as const,
  transactionsList: (
    userId: string,
    filters: {
      pageIndex: number;
      pageSize: number;
      search: string;
      sorting: SortingState;
      filters: SimpleFilter[];
    }
  ) => [...creditsKeys.transactions(userId), filters] as const,
};

// 余额展示与支付同步共用服务端读取入口。
async function fetchCreditBalance(userId: string | undefined) {
  if (!userId) throw new Error('读取积分余额需要登录用户');
  const result = await getCreditBalanceAction();
  if (!result?.data?.success) {
    throw new Error(result?.data?.error || '读取积分余额失败');
  }
  return result.data.credits ?? 0;
}

export function useCreditBalance(
  userId: string | undefined,
  options?: CreditQueryOptions
) {
  return useQuery({
    queryKey: creditsKeys.balance(userId || ''),
    queryFn: () => fetchCreditBalance(userId),
    staleTime: 0,
    refetchOnWindowFocus: true,
    enabled: !!userId && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval ?? false,
  });
}

// Hook to fetch credit statistics
export function useCreditStats(
  userId: string | undefined,
  options?: CreditQueryOptions
) {
  return useQuery({
    queryKey: creditsKeys.stats(userId || ''),
    queryFn: async () => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      console.log('Fetching credit stats...');
      const result = await getCreditStatsAction();
      if (!result?.data?.success) {
        console.log('useCreditStats error:', result?.data?.error);
        throw new Error(result?.data?.error || 'Failed to fetch credit stats');
      }
      console.log('Credit stats fetched:', result.data.data);
      return result.data.data;
    },
    enabled: !!userId && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval ?? false,
  });
}

export function useCreditPurchaseSync(
  userId: string | undefined,
  syncId: string,
  options?: CreditQueryOptions & { refreshBalanceOnSync?: boolean }
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: creditsKeys.purchaseSync(userId || '', syncId),
    queryFn: async () => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const result = await checkPaymentSyncAction({ syncId });
      if (!result?.data?.success) {
        console.log('useCreditPurchaseSync error:', result?.data?.error);
        throw new Error(
          result?.data?.error || 'Failed to check credit purchase sync'
        );
      }

      if (result.data.synced && options?.refreshBalanceOnSync) {
        const balanceKey = creditsKeys.balance(userId);
        // 取消入账前发出的查询，避免旧请求晚到后覆盖新余额。
        await queryClient.cancelQueries({ queryKey: balanceKey });
        const balance = await fetchCreditBalance(userId);
        queryClient.setQueryData(balanceKey, balance);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: creditsKeys.stats(userId),
          }),
          queryClient.invalidateQueries({
            queryKey: creditsKeys.transactions(userId),
          }),
        ]);
      }
      return result.data.synced;
    },
    enabled: !!userId && !!syncId && (options?.enabled ?? true),
    staleTime: 0,
    refetchInterval: (query) =>
      options?.refreshBalanceOnSync && query.state.data === true
        ? false
        : (options?.refetchInterval ?? false),
  });
}

// Hook to consume credits
export function useConsumeCredits(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      amount,
      description,
    }: {
      amount: number;
      description: string;
    }) => {
      const result = await consumeCreditsAction({
        amount,
        description,
      });
      if (!result?.data?.success) {
        console.log('useConsumeCredits error:', result?.data?.error);
        throw new Error(result?.data?.error || 'Failed to consume credits');
      }
      return result.data;
    },
    onSuccess: () => {
      if (!userId) return;
      // Invalidate credit balance, stats, and transactions after consuming credits
      queryClient.invalidateQueries({
        queryKey: creditsKeys.balance(userId),
      });
      queryClient.invalidateQueries({
        queryKey: creditsKeys.stats(userId),
      });
      queryClient.invalidateQueries({
        queryKey: creditsKeys.transactions(userId),
      });
    },
  });
}

// Hook to fetch credit transactions with pagination, search, sorting, and filters
export function useCreditTransactions(
  userId: string | undefined,
  pageIndex: number,
  pageSize: number,
  search: string,
  sorting: SortingState,
  filters: SimpleFilter[]
) {
  return useQuery({
    queryKey: creditsKeys.transactionsList(userId || '', {
      pageIndex,
      pageSize,
      search,
      sorting,
      filters,
    }),
    queryFn: async () => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      const result = await getCreditTransactionsAction({
        pageIndex,
        pageSize,
        search,
        sorting,
        filters,
      });

      if (!result?.data?.success) {
        console.log('useCreditTransactions error:', result?.data?.error);
        throw new Error(
          result?.data?.error || 'Failed to fetch credit transactions'
        );
      }

      return {
        items: result.data.data?.items || [],
        total: result.data.data?.total || 0,
      };
    },
    enabled: !!userId,
    placeholderData: keepPreviousData,
  });
}
