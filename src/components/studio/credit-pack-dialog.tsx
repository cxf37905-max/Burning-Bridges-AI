'use client';

import { useRef, useState } from 'react';
import { RouteLink as Link } from '@/components/layout/locale-link';
import { useRouter } from 'next/navigation';
import { transitionRoute } from '@/components/layout/route-transitions';
import { paymentProviderLabel } from '@/config/website';
import { useVideoCheckout } from './use-video-checkout';
import { Check, LoaderCircle, LockKeyhole } from 'lucide-react';
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchasesReady: boolean;
  balance: number;
  beforeCheckout?: () => Promise<void>;
}) {
  const router = useRouter();
  const [packId, setPackId] = useState<PackId>('trio');
  const dialogRef = useRef<HTMLDivElement>(null);
  const { busy, error, setError, openCheckout } = useVideoCheckout({
    purchasesReady,
    beforeCheckout,
    returnTo: '/#studio',
  });
  const pack = videoPacks.find((candidate) => candidate.id === packId)!;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setError('');
          if (!next) setPackId('trio');
          onOpenChange(next);
        }
      }}
    >
      <DialogContent
        ref={dialogRef}
        tabIndex={-1}
        className="bb-dialog bb-credit-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          setPackId('trio');
          dialogRef.current?.focus();
        }}
      >
        <DialogTitle>GET CREDITS</DialogTitle>
        <DialogDescription>
          This video uses {videoCreditCost} credits and you have {balance}. Your
          photos stay in the studio.
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
              {candidate.id === 'trio' && (
                <span className="bb-credit-popular">POPULAR</span>
              )}
              <strong>{formatPrice(candidate.cents)}</strong>
              <span className="bb-credit-video-count">
                {candidate.videos} {candidate.videos === 1 ? 'video' : 'videos'}
              </span>
              {packId === candidate.id && (
                <span className="bb-credit-check" aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </label>
          ))}
        </fieldset>
        {error && (
          <p role="alert" className="bb-form-error">
            {error}
          </p>
        )}
        <button
          type="button"
          className="bb-button bb-dialog-pay"
          onClick={() => openCheckout(packId)}
          disabled={busy || !purchasesReady}
        >
          {busy ? (
            <LoaderCircle size={17} className="bb-spin" aria-hidden="true" />
          ) : (
            <LockKeyhole size={17} aria-hidden="true" />
          )}
          {busy ? 'Opening checkout…' : `Pay ${formatPrice(pack.cents)}`}
        </button>
        <p className="bb-credit-footer">
          One-time payment, no subscription. Secure checkout by {paymentProviderLabel}.{' '}
          <Link
            href="/pricing"
            aria-disabled={busy}
            onNavigate={async (event) => {
              if (busy) {
                event.preventDefault();
                return;
              }
              if (!beforeCheckout) {
                onOpenChange(false);
                return;
              }
              event.preventDefault();
              setError('');
              try {
                await beforeCheckout();
                onOpenChange(false);
                if (!transitionRoute(() => router.push('/pricing')))
                  router.push('/pricing');
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : 'Your photo could not be saved. Please try again.'
                );
              }
            }}
          >
            Pricing details
          </Link>
        </p>
      </DialogContent>
    </Dialog>
  );
}
