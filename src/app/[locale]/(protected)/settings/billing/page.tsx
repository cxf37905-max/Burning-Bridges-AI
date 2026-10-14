import { readStudioAccountRecords } from '@/studio/account-records';
import { AccountPageHeading } from '@/components/studio/account-page-heading';
import { AccountBillingHistory } from '@/components/studio/account-billing-history';
import { CustomerPortalButton } from '@/components/pricing/customer-portal-button';
export default async function BillingPage() {
  const { user, orders } = await readStudioAccountRecords();
  return (
    <>
      <AccountPageHeading
        title="Billing & purchases."
        description="Your one-time payments, amounts and confirmation status."
      />
      <p className="bb-account-note">
        No subscription. No automatic renewal. Credits are added after payment
        is verified.
      </p>
      <AccountBillingHistory orders={orders} />
      {orders.length > 0 && (
        <CustomerPortalButton userId={user.id} className="bb-button" variant="outline">
          Manage billing & invoices
        </CustomerPortalButton>
      )}
      <p className="bb-account-note">
        Need help with a payment?{' '}
        <a href="mailto:support@burningbridgesai.cc">Contact support</a> with
        your order reference.
      </p>
    </>
  );
}
