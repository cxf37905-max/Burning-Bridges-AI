'use client';

import { Coins, LoaderCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { RouteLink as Link } from '@/components/layout/locale-link';
import { useCreditBalance, useCreditPurchaseSync } from '@/hooks/use-credits';
import { PAYMENT_POLL_INTERVAL } from '@/lib/constants';

export function StudioCreditBalance({ userId }: { userId: string }) {
  const searchParams = useSearchParams();
  const syncId =
    searchParams.get('checkout') === 'returned'
      ? searchParams.get('syncId')
      : null;
  const { data: synced } = useCreditPurchaseSync(userId, syncId ?? '', {
    enabled: Boolean(syncId),
    refetchInterval: PAYMENT_POLL_INTERVAL,
    refreshBalanceOnSync: true,
  });
  const waitingForPurchase = Boolean(syncId) && !synced;
  const { data: credits, isLoading, error, refetch } = useCreditBalance(userId, {
    enabled: !waitingForPurchase,
    refetchInterval: waitingForPurchase ? false : 15_000,
  });
  const showSpinner = waitingForPurchase || isLoading;

  useEffect(() => {
    if (!syncId || !synced) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('syncId') !== syncId) return;
    url.searchParams.delete('checkout');
    url.searchParams.delete('syncId');
    window.history.replaceState(window.history.state, '', url);
  }, [syncId, synced]);

  if (error && credits === undefined && !waitingForPurchase)
    return (
      <button
        type="button"
        className="bb-account-credit"
        onClick={() => void refetch()}
        aria-label="Could not load credits. Retry"
        title="Retry loading credits"
      >
        <Coins size={15} aria-hidden="true" />
        <span>Retry</span>
      </button>
    );

  return (
    <Link
      href="/settings/credits"
      className="bb-account-credit"
      aria-label={
        showSpinner
          ? 'Loading credits. View your credits'
          : `${credits} credits. View your credits`
      }
      title="View your credits"
      aria-busy={showSpinner}
    >
      {showSpinner ? (
        <LoaderCircle size={15} className="bb-spin" aria-hidden="true" />
      ) : (
        <>
          <Coins size={15} aria-hidden="true" />
          <span>{credits}</span>
        </>
      )}
    </Link>
  );
}
