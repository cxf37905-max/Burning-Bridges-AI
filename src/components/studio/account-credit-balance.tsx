'use client';
import { useState } from 'react';
import { CreditPackDialog } from './credit-pack-dialog';
import { videoCreditCost } from '@/studio/catalog';
export function AccountCreditBalance({
  credits,
  purchasesReady,
}: {
  credits: number;
  purchasesReady: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="bb-account-balance" aria-label="Credit balance">
      <div>
        <span>Available balance</span>
        <strong>
          {credits} <small>credits</small>
        </strong>
        <p>{videoCreditCost} credits per HD 720p video.</p>
      </div>
      <button type="button" className="bb-button" onClick={() => setOpen(true)}>
        Buy credits ↗
      </button>
      <CreditPackDialog
        open={open}
        onOpenChange={setOpen}
        purchasesReady={purchasesReady}
        balance={credits}
      />
    </section>
  );
}
