import { readStudioAccountRecords } from '@/studio/account-records';
import { getStudioAvailability } from '@/studio/availability';
import { AccountPageHeading } from '@/components/studio/account-page-heading';
import { AccountCreditBalance } from '@/components/studio/account-credit-balance';
export default async function CreditsPage() {
  const records = await readStudioAccountRecords();
  const entries = records.transactions;
  return (
    <>
      <AccountPageHeading
        title="Your credits."
        description="Buy credits, make videos, and see every balance change here."
      />
      <AccountCreditBalance
        credits={records.balance}
        purchasesReady={getStudioAvailability().purchasesReady}
      />
      <p className="bb-account-note">
        Credits are available only through purchase. Registration and signing in
        do not award credits. Failed video refunds return credits already spent.
      </p>
      <h2 className="bb-account-section-title">Credit history</h2>
      {entries.length ? (
        <div className="bb-account-table-scroll">
          <table className="bb-account-table">
            <caption className="sr-only">
              Your most recent 100 credit events
            </caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Activity</th>
                <th>Credits</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <time dateTime={entry.createdAt.toISOString()}>
                      {entry.createdAt.toLocaleDateString('en-US', {
                        timeZone: 'UTC',
                      })}
                    </time>
                  </td>
                  <td>
                    {entry.description || entry.type}
                    <small>{entry.reference || entry.id}</small>
                  </td>
                  <td className={entry.amount > 0 ? 'bb-credit-positive' : ''}>
                    {entry.amount > 0 ? '+' : ''}
                    {entry.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bb-account-empty">
          <h2>No credit activity yet.</h2>
          <p>
            Your purchases, video generation and failed video refunds will
            appear here.
          </p>
        </div>
      )}
    </>
  );
}
