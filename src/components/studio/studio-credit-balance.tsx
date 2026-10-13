'use client';

import { Coins, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useCreditBalance } from '@/hooks/use-credits';

export function StudioCreditBalance({ userId }: { userId: string }) {
  const { data: credits, isLoading, error, refetch } = useCreditBalance(userId, {
    refetchInterval: 15_000,
  });

  if (error && credits === undefined)
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
        isLoading
          ? 'Loading credits. View your credits'
          : `${credits} credits. View your credits`
      }
      title="View your credits"
      aria-busy={isLoading}
    >
      <Coins size={15} aria-hidden="true" />
      {isLoading ? (
        <LoaderCircle size={15} className="bb-spin" aria-hidden="true" />
      ) : (
        <span>{credits}</span>
      )}
    </Link>
  );
}
