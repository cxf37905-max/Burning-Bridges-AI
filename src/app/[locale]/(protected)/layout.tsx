import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getStudioUser } from '@/studio/auth';
import { StudioHeader } from '@/components/studio/studio-header';
import { StudioFooter } from '@/components/studio/studio-footer';
import { AccountNavigation } from '@/components/studio/account-navigation';
import '@/styles/studio.css';

export const metadata = { robots: { index: false, follow: true } };

export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getStudioUser();
  if (!user) redirect('/auth/login?callbackUrl=/dashboard');
  return (
    <div className="bb-site">
      <StudioHeader />
      <main id="main-content" className="bb-shell bb-account-shell">
        <div className="bb-account-layout">
          <AccountNavigation />
          <div className="bb-account-content">{children}</div>
        </div>
      </main>
      <StudioFooter />
    </div>
  );
}
