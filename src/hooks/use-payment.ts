import { checkPaymentSyncAction } from '@/actions/check-payment-sync';
import { getCurrentPlanAction } from '@/actions/get-current-plan';
import { getAllPricePlans } from '@/lib/price-plan';
import type { PricePlan, Subscription } from '@/payment/types';
import { useQuery } from '@tanstack/react-query';

type CurrentPlanQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

// Query keys
export const paymentKeys = {
  all: ['payment'] as const,
  currentPlan: (userId: string) =>
    [...paymentKeys.all, 'currentPlan', userId] as const,
  billingSync: (userId: string, syncId: string) =>
    [...paymentKeys.all, 'billingSync', userId, syncId] as const,
};

// Hook to get current plan with subscription and lifetime status
export function useCurrentPlan(
  userId: string | undefined,
  options?: CurrentPlanQueryOptions
) {
  return useQuery({
    queryKey: paymentKeys.currentPlan(userId || ''),
    queryFn: async (): Promise<{
      currentPlan: PricePlan | null;
      subscription: Subscription | null;
    }> => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      console.log('>>> Check current plan start for userId:', userId);
      const result = await getCurrentPlanAction({ userId });
      if (!result?.data?.success) {
        console.log('<<< Check current plan failed:', result?.data?.error);
        throw new Error(result?.data?.error || 'Failed to fetch current plan');
      }

      console.log('<<< Check current plan success');
      return (
        result.data.data || {
          currentPlan: getAllPricePlans().find((plan) => plan.isFree) || null,
          subscription: null,
        }
      );
    },
    enabled: !!userId && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval ?? false,
    refetchOnWindowFocus: true,
  });
}

export function useBillingPaymentSync(
  userId: string | undefined,
  syncId: string,
  options?: CurrentPlanQueryOptions
) {
  return useQuery({
    queryKey: paymentKeys.billingSync(userId || '', syncId),
    queryFn: async (): Promise<boolean> => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const result = await checkPaymentSyncAction({ syncId });
      if (!result?.data?.success) {
        console.log('useBillingPaymentSync error:', result?.data?.error);
        throw new Error(
          result?.data?.error || 'Failed to check billing payment sync'
        );
      }

      return result.data.synced;
    },
    enabled: !!userId && !!syncId && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval ?? false,
  });
}
