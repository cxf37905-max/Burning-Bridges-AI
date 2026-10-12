import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowUpRight, AudioLines } from 'lucide-react';
import { StudioAccount } from './studio-account';
import { StudioSectionLink } from './studio-section-link';
import { getStudioAvailability } from '@/studio/availability';

export function StudioHeader() {
  return (
    <header className="bb-header">
      <div className="bb-shell bb-nav">
        <Link
          href="/"
          className="bb-brand"
          aria-label="Burning Bridges AI home"
        >
          <span className="bb-brand-icon">
            <AudioLines size={22} strokeWidth={2.5} />
          </span>
          <span>
            Burning Bridges <span className="bb-brand-ai">AI</span>
          </span>
        </Link>
        <nav className="bb-nav-links" aria-label="Main navigation">
          <StudioSectionLink href="/#how-it-works">
            How it works
          </StudioSectionLink>
          <StudioSectionLink href="/#pricing">Pricing</StudioSectionLink>
        </nav>
        <div className="bb-nav-actions">
          <Suspense
            fallback={
              <Link className="bb-signin" href="/auth/login">
                Sign in
              </Link>
            }
          >
            <StudioAccount authReady={getStudioAvailability().authReady} />
          </Suspense>
          <StudioSectionLink className="bb-button bb-button-small" href="/#studio">
            Make my video <ArrowUpRight size={15} />
          </StudioSectionLink>
        </div>
      </div>
    </header>
  );
}
