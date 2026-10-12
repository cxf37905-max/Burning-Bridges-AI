import type { ReactNode } from 'react';
import { AccountPageHeading } from '@/components/studio/account-page-heading';
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AccountPageHeading
        title="Security."
        description="Manage the password for your Burning Bridges AI account."
      />
      {children}
    </>
  );
}
