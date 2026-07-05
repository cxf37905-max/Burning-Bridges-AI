'use client';

import { CustomerPortalButton } from '@/components/pricing/customer-portal-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePricePlans } from '@/config/price-config';
import { useMounted } from '@/hooks/use-mounted';
import { useBillingPaymentSync, useCurrentPlan } from '@/hooks/use-payment';
import { LocaleLink } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { PAYMENT_MAX_POLL_TIME, PAYMENT_POLL_INTERVAL } from '@/lib/constants';
import { formatDate } from '@/lib/formatter';
import { cn } from '@/lib/utils';
import { Routes } from '@/routes';
import { CheckCircleIcon, ClockIcon, RefreshCwIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

interface BillingCardProps {
  paymentSyncId?: string | null;
}

type PaymentSyncStatus = 'checking' | 'refreshing' | 'timeout' | 'finished';

/**
 * Billing card, show current plan and subscription status
 */
export default function BillingCard({
  paymentSyncId = null,
}: BillingCardProps) {
  const t = useTranslations('Dashboard.settings.billing');
  const mounted = useMounted();
  const syncId = paymentSyncId ?? '';
  const canCheckPaymentSync = Boolean(syncId);
  const [paymentSyncStatus, setPaymentSyncStatus] =
    useState<PaymentSyncStatus>('checking');
  const shouldPollPaymentSync =
    canCheckPaymentSync && paymentSyncStatus === 'checking';

  // Get user session for customer ID
  const { data: session, isPending: isLoadingSession } =
    authClient.useSession();
  const currentUser = session?.user;
  const { data: isBillingPaymentSynced = false } = useBillingPaymentSync(
    currentUser?.id,
    canCheckPaymentSync ? syncId : '',
    {
      enabled: shouldPollPaymentSync,
      refetchInterval: shouldPollPaymentSync ? PAYMENT_POLL_INTERVAL : false,
    }
  );

  // Get current plan data
  const {
    data: paymentData,
    isLoading: isLoadingPayment,
    error: loadPaymentError,
    refetch: refetchPayment,
  } = useCurrentPlan(currentUser?.id, {
    enabled: !canCheckPaymentSync,
  });

  const currentPlan = paymentData?.currentPlan;
  const subscription = paymentData?.subscription;
  const isLifetimeMember = currentPlan?.isLifetime || false;
  const showPaymentSyncing =
    canCheckPaymentSync &&
    (paymentSyncStatus === 'checking' || paymentSyncStatus === 'refreshing');
  const showPaymentSyncDelayed =
    canCheckPaymentSync && paymentSyncStatus === 'timeout';

  // Get price plans with translations - must be called here to maintain hook order
  const pricePlans = usePricePlans();
  const plans = Object.values(pricePlans);

  // Convert current plan to a plan with translations
  const currentPlanWithTranslations = currentPlan
    ? plans.find((plan) => plan.id === currentPlan?.id)
    : null;
  const isFreePlan = currentPlanWithTranslations?.isFree || false;

  // Get current period start date
  const currentPeriodStart = subscription?.currentPeriodStart
    ? formatDate(subscription.currentPeriodStart)
    : null;

  // Get current period end date
  const currentPeriodEnd = subscription?.currentPeriodEnd
    ? formatDate(subscription.currentPeriodEnd)
    : null;

  // Get current trial end date
  const trialEndDate = subscription?.trialEndDate
    ? formatDate(subscription.trialEndDate)
    : null;

  // Retry payment data fetching
  const handleRetry = useCallback(() => {
    refetchPayment();
  }, [refetchPayment]);

  const clearPaymentSyncParams = useCallback(() => {
    const url = new URL(window.location.href);
    for (const param of ['payment', 'syncId']) {
      url.searchParams.delete(param);
    }

    window.history.replaceState(
      null,
      '',
      `${url.pathname}${url.search}${url.hash}`
    );
  }, []);

  useEffect(() => {
    setPaymentSyncStatus('checking');
  }, [syncId]);

  useEffect(() => {
    if (!canCheckPaymentSync || paymentSyncStatus !== 'checking') {
      return;
    }

    const timer = window.setTimeout(() => {
      setPaymentSyncStatus('timeout');
      clearPaymentSyncParams();
    }, PAYMENT_MAX_POLL_TIME);

    return () => window.clearTimeout(timer);
  }, [canCheckPaymentSync, clearPaymentSyncParams, paymentSyncStatus, syncId]);

  useEffect(() => {
    if (!isBillingPaymentSynced) {
      return;
    }

    let canceled = false;
    setPaymentSyncStatus('refreshing');

    void refetchPayment().finally(() => {
      if (canceled) {
        return;
      }

      setPaymentSyncStatus('finished');
      clearPaymentSyncParams();
    });

    return () => {
      canceled = true;
    };
  }, [clearPaymentSyncParams, isBillingPaymentSynced, refetchPayment]);

  // Render loading skeleton
  if (
    !mounted ||
    isLoadingSession ||
    (!canCheckPaymentSync && isLoadingPayment)
  ) {
    return (
      <Card className={cn('w-full overflow-hidden pt-6 pb-0 flex flex-col')}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {t('currentPlan.title')}
          </CardTitle>
          <CardDescription>{t('currentPlan.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 flex-1">
          <div className="flex items-center justify-start space-x-4">
            <Skeleton className="h-8 w-1/5" />
          </div>
          <div className="text-sm text-muted-foreground space-y-2">
            <Skeleton className="h-6 w-3/5" />
          </div>
        </CardContent>
        <CardFooter className="mt-2 px-6 py-4 flex justify-end items-center bg-muted rounded-none">
          <Skeleton className="h-8 w-1/4" />
        </CardFooter>
      </Card>
    );
  }

  // Render error state
  if (loadPaymentError) {
    return (
      <Card className={cn('w-full overflow-hidden pt-6 pb-0 flex flex-col')}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {t('currentPlan.title')}
          </CardTitle>
          <CardDescription>{t('currentPlan.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 flex-1">
          <div className="text-destructive text-sm">
            {loadPaymentError?.message}
          </div>
        </CardContent>
        <CardFooter className="mt-2 px-6 py-4 flex justify-end items-center bg-muted rounded-none">
          <Button variant="outline" onClick={handleRetry}>
            <RefreshCwIcon className="size-4 mr-1" />
            {t('retry')}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (
    !currentPlanWithTranslations &&
    (showPaymentSyncing || showPaymentSyncDelayed)
  ) {
    return (
      <Card className={cn('w-full overflow-hidden pt-6 pb-0 flex flex-col')}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {t('currentPlan.title')}
          </CardTitle>
          <CardDescription>{t('currentPlan.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 flex-1">
          {showPaymentSyncing && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <RefreshCwIcon className="mt-0.5 size-4 shrink-0 animate-spin" />
              <span>{t('paymentSyncing')}</span>
            </div>
          )}

          {showPaymentSyncDelayed && (
            <div className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
              <ClockIcon className="mt-0.5 size-4 shrink-0" />
              <span>{t('paymentSyncDelayed')}</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // currentPlan maybe null, so we need to check if it is null
  if (!currentPlanWithTranslations) {
    return (
      <Card className={cn('w-full overflow-hidden pt-6 pb-0 flex flex-col')}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {t('currentPlan.title')}
          </CardTitle>
          <CardDescription>{t('currentPlan.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {t('currentPlan.noPlan')}
          </div>
        </CardContent>
        <CardFooter className="mt-2 px-6 py-4 flex justify-end items-center bg-muted rounded-none">
          <Button variant="default" asChild>
            <LocaleLink href={Routes.Pricing}>{t('upgradePlan')}</LocaleLink>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className={cn('w-full overflow-hidden pt-6 pb-0 flex flex-col')}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {t('currentPlan.title')}
        </CardTitle>
        <CardDescription>{t('currentPlan.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 flex-1">
        {showPaymentSyncing && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <RefreshCwIcon className="mt-0.5 size-4 shrink-0 animate-spin" />
            <span>{t('paymentSyncing')}</span>
          </div>
        )}

        {showPaymentSyncDelayed && (
          <div className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            <ClockIcon className="mt-0.5 size-4 shrink-0" />
            <span>{t('paymentSyncDelayed')}</span>
          </div>
        )}

        {/* Plan name and status */}
        <div className="flex items-center justify-start space-x-4">
          <div className="text-3xl font-medium">
            {currentPlanWithTranslations?.name}
          </div>
          {subscription &&
            (subscription.status === 'trialing' ||
              subscription.status === 'active') && (
              <Badge
                variant="outline"
                className={cn(
                  'text-xs border-transparent',
                  subscription.status === 'trialing'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                    : 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                )}
              >
                {subscription.status === 'trialing' ? (
                  <div className="flex items-center space-x-2">
                    <ClockIcon className="size-3 mr-1" />
                    {t('status.trial')}
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <CheckCircleIcon className="size-3 mr-1" />
                    {t('status.active')}
                  </div>
                )}
              </Badge>
            )}
        </div>

        {/* Free plan message */}
        {isFreePlan && (
          <div className="text-sm text-muted-foreground">
            {t('freePlanMessage')}
          </div>
        )}

        {/* Lifetime plan message */}
        {isLifetimeMember && (
          <div className="text-sm text-muted-foreground">
            {t('lifetimeMessage')}
          </div>
        )}

        {/* Subscription plan message */}
        {subscription && (
          <div className="text-sm text-muted-foreground space-y-2">
            {currentPeriodStart && (
              <div className="text-muted-foreground">
                {t('periodStartDate')} {currentPeriodStart}
              </div>
            )}

            {currentPeriodEnd && (
              <div className="text-muted-foreground">
                {t('periodEndDate')} {currentPeriodEnd}
              </div>
            )}

            {subscription.status === 'trialing' && trialEndDate && (
              <div className="text-amber-600">
                {t('trialEnds')} {trialEndDate}
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="mt-2 px-6 py-4 flex justify-end items-center bg-muted rounded-none">
        {/* user is on free plan, show upgrade plan button */}
        {isFreePlan && (
          <Button variant="default" asChild>
            <LocaleLink href={Routes.Pricing}>{t('upgradePlan')}</LocaleLink>
          </Button>
        )}

        {/* user is lifetime member, show manage billing button */}
        {isLifetimeMember && currentUser && (
          <CustomerPortalButton userId={currentUser.id} className="">
            {t('manageBilling')}
          </CustomerPortalButton>
        )}

        {/* user has subscription, show manage subscription button */}
        {subscription && currentUser && (
          <CustomerPortalButton userId={currentUser.id} className="">
            {t('manageSubscription')}
          </CustomerPortalButton>
        )}
      </CardFooter>
    </Card>
  );
}
