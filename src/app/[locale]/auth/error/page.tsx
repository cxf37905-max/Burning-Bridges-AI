import { ErrorCard } from '@/components/auth/error-card';
import { studioMetadata } from '@/studio/metadata';
export const metadata = studioMetadata({
  title: 'Sign-in error | Burning Bridges AI',
  description: 'Return to your Burning Bridges AI account.',
  path: '/auth/error',
  noIndex: true,
});
export default function AuthErrorPage() {
  return <ErrorCard />;
}
