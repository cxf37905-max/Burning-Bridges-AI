import { formatPrice, videoCreditCost } from '@/studio/catalog';
import type { StudioAccountRecords } from '@/studio/account-records';

export function AccountBillingHistory({
  orders,
}: {
  orders: StudioAccountRecords['orders'];
}) {
  if (!orders.length)
    return (
      <div className="bb-account-empty">
        <h2>No purchases yet.</h2>
        <p>
          Buy a one-time credit pack whenever you are ready. There is no
          subscription or automatic renewal.
        </p>
      </div>
    );
  return (
    <div className="bb-account-table-scroll">
      <table className="bb-account-table">
        <caption className="sr-only">Your most recent 100 orders</caption>
        <thead>
          <tr>
            <th>Date / order</th>
            <th>Payment provider</th>
            <th>Credits</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <time dateTime={order.createdAt.toISOString()}>
                  {order.createdAt.toLocaleDateString('en-US', {
                    timeZone: 'UTC',
                  })}
                </time>
                <small>{order.id}</small>
              </td>
              <td>{order.providerLabel}</td>
              <td>{order.videos * videoCreditCost}</td>
              <td>
                {formatPrice(order.cents)} <small>{order.currency}</small>
              </td>
              <td>
                <span className="bb-account-status" data-status={order.status}>
                  {order.status === 'paid'
                    ? 'Paid'
                    : order.status === 'refunded'
                      ? 'Refunded'
                      : order.status === 'closed'
                        ? 'Closed'
                        : 'Pending'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
