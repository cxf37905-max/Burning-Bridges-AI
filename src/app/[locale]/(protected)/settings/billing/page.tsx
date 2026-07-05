import BillingCard from '@/components/settings/billing/billing-card';

type BillingPageSearchParams = Promise<{
  payment?: string | string[];
  syncId?: string | string[];
}>;

const getBillingPaymentSyncParams = async (
  searchParams: BillingPageSearchParams
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
 * Billing page, show billing information
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: BillingPageSearchParams;
}) {
  const paymentSyncId = await getBillingPaymentSyncParams(searchParams);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <BillingCard paymentSyncId={paymentSyncId} />
      </div>
    </div>
  );
}
