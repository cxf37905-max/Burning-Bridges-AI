import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { studioMetadata } from '@/studio/metadata';
import { Suspense } from 'react';
export const metadata = {
  ...studioMetadata({
    title: 'Reset your password | Burning Bridges AI',
    description: 'Reset the password for your Burning Bridges AI account.',
    path: '/auth/forgot-password',
    noIndex: true,
  }),
  robots: { index: false, follow: true },
};
export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
