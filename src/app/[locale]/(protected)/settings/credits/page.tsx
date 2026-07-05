import CreditsPageClient from '@/components/settings/credits/credits-page-client';
import { websiteConfig } from '@/config/website';
import { Routes } from '@/routes';
import { redirect } from 'next/navigation';

type CreditsPageSearchParams = Promise<{
  payment?: string | string[];
  syncId?: string | string[];
}>;

const getCreditPaymentSyncParams = async (
  searchParams: CreditsPageSearchParams
): Promise<string | null> => {
  const params = await searchParams;
  const payment = params.payment;
  const syncId = params.syncId;

  if (payment !== 'syncing' || typeof syncId !== 'string') {
    return null;
  }

  return syncId;
};

/**
 * Credits page, show credit balance and transactions
 */
export default async function CreditsPage({
  searchParams,
}: {
  searchParams: CreditsPageSearchParams;
}) {
  // If credits are disabled, redirect to billing page
  if (!websiteConfig.credits.enableCredits) {
    redirect(Routes.SettingsBilling);
  }

  const paymentSyncId = await getCreditPaymentSyncParams(searchParams);

  return <CreditsPageClient paymentSyncId={paymentSyncId} />;
}
