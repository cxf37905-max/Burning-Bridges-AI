'use client';

import { useRef, useState } from 'react';
import type { PackId } from '@/studio/catalog';

export function useVideoCheckout({
  purchasesReady,
  beforeCheckout,
  returnTo,
}: {
  purchasesReady: boolean;
  beforeCheckout?: () => Promise<void>;
  returnTo: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const checkoutRequest = useRef<{ packId: PackId; requestId: string } | null>(
    null
  );

  async function openCheckout(packId: PackId) {
    if (submitting.current || !purchasesReady) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    if (checkoutRequest.current?.packId !== packId)
      checkoutRequest.current = { packId, requestId: crypto.randomUUID() };
    try {
      await beforeCheckout?.();
      const response = await fetch('/api/studio/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutRequest.current),
      });
      if (response.status === 401) {
        window.location.assign(
          `/auth/login?callbackUrl=${encodeURIComponent(returnTo)}`
        );
        return;
      }
      const result = await response.json();
      if (!response.ok || typeof result.url !== 'string')
        throw new Error(
          result.error || 'Checkout could not start. Please try again.'
        );
      window.location.assign(result.url);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Checkout could not start. Please try again.'
      );
      submitting.current = false;
      setBusy(false);
    }
  }

  return {
    openCheckout,
    busy,
    pendingPackId: busy ? checkoutRequest.current?.packId : null,
    error,
    setError,
  };
}
