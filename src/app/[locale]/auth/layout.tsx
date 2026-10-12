import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { StudioHeader } from '@/components/studio/studio-header';
import { StudioFooter } from '@/components/studio/studio-footer';
import '@/styles/studio.css';

export const metadata = { robots: { index: false, follow: true } };

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bb-site">
      <StudioHeader />
      <main id="main-content" className="bb-auth-page">
        <Suspense fallback={<p>Loading your account…</p>}>{children}</Suspense>
      </main>
      <StudioFooter />
    </div>
  );
}
