'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { readStudioAccount } from '@/studio/account-query';
import { CreditPackDialog } from './credit-pack-dialog';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';

import {
  formatPrice,
  videoPacks,
  videoCreditCost,
  type PackId,
} from '@/studio/catalog';

export function VideoPricing({ purchasesReady }: { purchasesReady: boolean }) {
  const [selectedId, setSelectedId] = useState<PackId | null>(null);
  const { data: account } = useSWR('/api/studio/account', readStudioAccount);

  return (
    <section
      id="pricing"
      className="bb-pricing bb-shell"
      aria-labelledby="pricing-title"
    >
      <div className="bb-pricing-heading">
        <div>
          <span className="bb-section-kicker">ONE-TIME VIDEO PACKS</span>
          <h2 id="pricing-title">Burning Bridges AI Pricing</h2>
        </div>
        <p>
          The generator shows the credit cost before you create your video, so
          you can see what the selected output requires before you generate.
        </p>
      </div>
      <p className="bb-pricing-credit-cost">
        The current HD 720p option uses {videoCreditCost} credits per
        generation.
      </p>
      <div className="bb-price-grid">
        {videoPacks.map((pack) => (
          <article
            key={pack.id}
            className={`bb-price-pack ${pack.id === 'trio' ? 'bb-price-featured' : ''}`}
          >
            {pack.id === 'trio' && (
              <span className="bb-price-badge">Best for a first night out</span>
            )}
            <div className="bb-pack-top">
              <h3>{pack.name}</h3>
              <span>
                {pack.videos === 1 ? '1 VIDEO' : `${pack.videos} VIDEOS`}
              </span>
            </div>
            <p className="bb-pack-note">{pack.note}</p>
            <p className="bb-pack-price">
              {formatPrice(pack.cents)}
              <span>USD</span>
            </p>
            <p className="bb-unit-price">
              {formatPrice(Math.round(pack.cents / pack.videos))} per video ·
              paid once
            </p>
            <ul>
              <li>
                <Check size={14} />
                {pack.videos * videoCreditCost} credits · {pack.videos} Burning
                Bridges AI {pack.videos === 1 ? 'video' : 'videos'}
              </li>
              <li>
                <Check size={14} />
                20 seconds · 720p MP4 · music included
              </li>
              <li>
                <Check size={14} />
                No automatic renewal
              </li>
            </ul>
            <button
              type="button"
              className={`bb-button ${pack.id === 'trio' ? '' : 'bb-button-secondary'}`}
              onClick={() => {
                setSelectedId(pack.id);
              }}
            >
              Buy credits <ArrowRight size={15} />
            </button>
          </article>
        ))}
      </div>
      <p className="bb-pricing-footnote">
        <ShieldCheck size={14} />
        {purchasesReady
          ? 'Secure checkout with Waffo. Review your total before paying.'
          : 'Preview pricing. Final packs will be confirmed at launch. No payment is collected in preview.'}
      </p>
      <CreditPackDialog
        key={selectedId || 'single'}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        purchasesReady={purchasesReady}
        balance={account?.user?.credits || 0}
        initialPackId={selectedId || 'single'}
      />
    </section>
  );
}
