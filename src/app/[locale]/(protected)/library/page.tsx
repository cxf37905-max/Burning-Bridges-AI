import { RouteLink as Link } from '@/components/layout/locale-link';
import { readStudioAccountRecords } from '@/studio/account-records';
import { AccountPageHeading } from '@/components/studio/account-page-heading';
import { VideoJobStatus } from '@/components/studio/video-job-status';

export default async function LibraryPage() {
  const { videos } = await readStudioAccountRecords();
  return (
    <>
      <AccountPageHeading
        title="Your videos."
        description="Your Burning Bridges AI generations, progress and downloads."
      />
      {videos.length ? (
        videos.map((video) => <VideoJobStatus key={video.id} id={video.id} />)
      ) : (
        <div className="bb-account-empty">
          <h2>Your first video starts with a photo.</h2>
          <p>
            Choose a template in the studio. Each HD 720p video costs 100
            credits.
          </p>
        </div>
      )}
      <Link href="/#studio" className="bb-button">
        Make my video ↗
      </Link>
    </>
  );
}
