import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { studioMetadata } from '@/studio/metadata';
import { Suspense } from 'react';
export const metadata = {
  ...studioMetadata({
    title: 'Choose a new password | Burning Bridges AI',
    description: 'Secure your Burning Bridges AI account with a new password.',
    path: '/auth/reset-password',
    noIndex: true,
  }),
  robots: { index: false, follow: true },
};
export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
