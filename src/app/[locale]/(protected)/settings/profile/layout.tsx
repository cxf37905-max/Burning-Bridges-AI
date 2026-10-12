import type { ReactNode } from 'react';
import { AccountPageHeading } from '@/components/studio/account-page-heading';
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AccountPageHeading
        title="Profile."
        description="Your name and account details."
      />
      {children}
    </>
  );
}
