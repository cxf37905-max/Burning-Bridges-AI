import { VideoPricing } from '@/components/studio/video-pricing';
import { getStudioAvailability } from '@/studio/availability';
import { studioMetadata } from '@/studio/metadata';

export const metadata = studioMetadata({ title: 'Burning Bridges AI Pricing — One-Time Video Packs', description: 'Burning Bridges AI pricing starts at $9.90 for one video. Compare one-time video packs with no subscription. Secure Waffo checkout opens with generation.', path: '/pricing' });

export default function PricingPage() {
  return <><div className="bb-shell" style={{ paddingTop: 60, paddingBottom: 35 }}><h1 style={{ fontSize: 'clamp(36px,5vw,64px)', fontWeight: 600, lineHeight: 1.08, letterSpacing: '-2px' }}>Burning Bridges AI pricing.</h1><p style={{ color: 'var(--bb-muted)', marginTop: 20 }}>Your next party moment, without a monthly plan.</p></div><VideoPricing purchasesReady={getStudioAvailability().purchasesReady} /></>;
}
