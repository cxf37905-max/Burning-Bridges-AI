import Link from 'next/link';
import { websiteConfig } from '@/config/website';
import { purchasedCreditValidityMonths } from '@/credits/policy';

export function VideoPricingDetails() {
  const supportEmail = websiteConfig.legal.supportEmail;

  return (
    <div className="bb-pricing-details">
      <p>
        All prices are in USD. Review your final total, including any applicable
        taxes, at checkout. Payments are processed by Waffo.
      </p>
      <p>
        One-time payments only. Nothing renews. Purchases are final: unused or
        partly used credits are not refundable, except as required by law or
        stated in our refund terms. Questions or receipt requests:{' '}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>
      <p>
        Every pack offers the same HD 720p video quality. Packs differ only in
        how many credits you get. Credits are valid for{' '}
        {purchasedCreditValidityMonths} months from purchase.
      </p>
      <nav aria-label="Billing and service policies">
        <Link href="/terms#payment-refunds">Billing and refund terms</Link>
        <span aria-hidden="true">·</span>
        <Link href="/privacy">Privacy</Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms#content-standards">Content standards</Link>
      </nav>
    </div>
  );
}
