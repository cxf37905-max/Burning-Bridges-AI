'use client';

import { useVideoCheckout } from './use-video-checkout';
import { VideoPricingDetails } from './video-pricing-details';
import {
  ArrowRight,
  Check,
  Clock3,
  Coins,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import { purchasedCreditValidityMonths } from '@/credits/policy';

import { formatPrice, videoPacks, videoCreditCost } from '@/studio/catalog';

export function VideoPricing({
  purchasesReady,
  showHeading = true,
}: {
  purchasesReady: boolean;
  showHeading?: boolean;
}) {
  const { openCheckout, busy, pendingPackId, error } = useVideoCheckout({
    purchasesReady,
    returnTo: '/pricing',
  });

  return (
    <section
      id="pricing"
      className="bb-pricing bb-shell"
      aria-labelledby={showHeading ? 'pricing-title' : undefined}
      aria-label={showHeading ? undefined : 'Video packs'}
    >
      {showHeading && (
        <div className="bb-pricing-heading">
          <div>
            <span className="bb-section-kicker">VIDEO PACKS</span>
            <h2 id="pricing-title">Burning Bridges AI Pricing</h2>
          </div>
          <p>Buy credits once. No subscription.</p>
        </div>
      )}
      <p className="bb-pricing-credit-cost">
        {videoCreditCost} credits per 20-second HD 720p video.
      </p>
      <div className="bb-price-grid">
        {videoPacks.map((pack) => (
          <article
            key={pack.id}
            className={`bb-price-pack ${pack.id === 'trio' ? 'bb-price-featured' : ''}`}
          >
            {pack.id === 'trio' && (
              <span className="bb-price-badge">Most popular</span>
            )}
            <div className="bb-pack-top">
              <h3>{pack.name}</h3>
            </div>
            <p className="bb-pack-note">{pack.note}</p>
            <p className="bb-pack-price">
              {formatPrice(pack.cents)}
              <span>USD</span>
            </p>
            <ul>
              <li>
                <Coins size={14} aria-hidden="true" />
                {pack.videos * videoCreditCost} credits
              </li>
              <li>
                <Check size={14} aria-hidden="true" />
                {pack.videos} {pack.videos === 1 ? 'video' : 'videos'}
              </li>
              <li>
                <Clock3 size={14} aria-hidden="true" />
                Credits valid for {purchasedCreditValidityMonths} months
              </li>
              <li>
                <RefreshCw size={14} aria-hidden="true" />
                Failed videos: credits returned automatically
              </li>
            </ul>
            <button
              type="button"
              className={`bb-button ${pack.id === 'trio' ? '' : 'bb-button-secondary'}`}
              onClick={() => openCheckout(pack.id)}
              disabled={busy || !purchasesReady}
            >
              {busy && pendingPackId === pack.id ? (
                <>
                  Opening checkout…
                  <LoaderCircle size={15} className="bb-spin" aria-hidden="true" />
                </>
              ) : (
                <>
                  Buy credits <ArrowRight size={15} aria-hidden="true" />
                </>
              )}
            </button>
          </article>
        ))}
      </div>
      {error && (
        <p role="alert" className="bb-form-error">
          {error}
        </p>
      )}
      <VideoPricingDetails />
    </section>
  );
}
