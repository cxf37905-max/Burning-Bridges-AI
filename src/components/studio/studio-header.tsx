import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowUpRight, AudioLines } from 'lucide-react';
import { StudioAccount } from './studio-account';
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
          <Link href="/#studio">Create</Link>
          <Link href="/#about">The video</Link>
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/pricing">Pricing</Link>
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
          <Link className="bb-button bb-button-small" href="/#studio">
            Make my video <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
    </header>
  );
}
