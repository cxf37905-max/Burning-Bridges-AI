import Link from 'next/link';
import { readStudioAccountRecords } from '@/studio/account-records';
import { getStudioAvailability } from '@/studio/availability';
import { AccountPageHeading } from '@/components/studio/account-page-heading';
import { AccountCreditBalance } from '@/components/studio/account-credit-balance';
export default async function DashboardPage() {
  const { balance, videos } = await readStudioAccountRecords();
  return (
    <>
      <AccountPageHeading
        title="Your studio."
        description="Your Burning Bridges AI videos and purchased credits, together."
      />
      <AccountCreditBalance
        credits={balance}
        purchasesReady={getStudioAvailability().purchasesReady}
      />
      <section className="bb-account-next">
        <div>
          <h2>Make your next Burning Bridges AI video.</h2>
          <p>
            Choose a photo and a template. Each HD 720p video uses 100 credits.
          </p>
        </div>
        <Link className="bb-button" href="/#studio">
          Make my video ↗
        </Link>
      </section>
      <div className="bb-account-summary">
        <p>
          {videos.filter((video) => video.status === 'succeeded').length}{' '}
          completed videos in your recent history.
        </p>
        <Link href="/library">Open my videos ↗</Link>
      </div>
    </>
  );
}
