import { redirect } from 'next/navigation';
import { authRedirect } from '@/lib/auth-redirect';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  redirect(
    '/?auth=login&callbackUrl=' + encodeURIComponent(authRedirect(callbackUrl))
  );
}
