'use client';

import { useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  formatPrice,
  videoPacks,
  videoCreditCost,
  type PackId,
} from '@/studio/catalog';

export function CreditPackDialog({
  open,
  onOpenChange,
  purchasesReady,
  balance,
  beforeCheckout,
  initialPackId = 'single',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchasesReady: boolean;
  balance: number;
  beforeCheckout?: () => Promise<void>;
  initialPackId?: PackId;
}) {
  const [packId, setPackId] = useState<PackId>(initialPackId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const checkoutRequest = useRef<{ packId: PackId; requestId: string } | null>(
    null
  );
  const pack = videoPacks.find((candidate) => candidate.id === packId)!;

  async function openCheckout() {
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
        window.location.assign('/sign-in');
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setError('');
          if (!next) setPackId(initialPackId);
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="bb-dialog">
        <DialogTitle>Get credits</DialogTitle>
        <DialogDescription>
          This video uses {videoCreditCost} credits. Your balance is {balance}{' '}
          credits. Your photo and template stay selected.
        </DialogDescription>
        <fieldset className="bb-credit-options" disabled={busy}>
          <legend className="sr-only">Credit pack</legend>
          {videoPacks.map((candidate) => (
            <label
              key={candidate.id}
              className={`bb-credit-option ${packId === candidate.id ? 'is-selected' : ''}`}
            >
              <input
                type="radio"
                name="credit-pack"
                value={candidate.id}
                checked={packId === candidate.id}
                onChange={() => setPackId(candidate.id)}
              />
              <strong>{candidate.videos * videoCreditCost} credits</strong>
              <span>
                {candidate.videos} {candidate.videos === 1 ? 'video' : 'videos'}
              </span>
              <b>{formatPrice(candidate.cents)}</b>
              {packId === candidate.id && <Check size={16} />}
            </label>
          ))}
        </fieldset>
        <p className="bb-dialog-note">
          One-time payment. No subscription. A purchase does not start
          generation automatically. By purchasing, you accept our{' '}
          <a
            className="bb-text-link"
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms
          </a>
          , including the{' '}
          <a
            className="bb-text-link"
            href="/terms#payment-refunds"
            target="_blank"
            rel="noopener noreferrer"
          >
            refund policy
          </a>
          .
        </p>
        {!purchasesReady && (
          <p className="bb-dialog-note">
            Checkout opens with video generation. No payment is collected in
            preview.
          </p>
        )}
        {error && (
          <p role="alert" className="bb-form-error">
            {error}
          </p>
        )}
        <button
          type="button"
          className="bb-button bb-dialog-pay"
          onClick={openCheckout}
          disabled={busy || !purchasesReady}
        >
          {busy && <LoaderCircle size={17} className="bb-spin" />}
          {busy
            ? 'Opening checkout…'
            : `Get ${pack.videos * videoCreditCost} credits · ${formatPrice(pack.cents)}`}
        </button>
        <p className="bb-local-note">Payments processed securely by Waffo.</p>
      </DialogContent>
    </Dialog>
  );
}
