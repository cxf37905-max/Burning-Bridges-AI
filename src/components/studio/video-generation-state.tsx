import { RouteLink as Link } from '@/components/layout/locale-link';
import { ArrowUpRight, LoaderCircle } from 'lucide-react';

export function VideoGenerationState({
  starting,
  submitting = false,
  notice,
  studio,
  onRetry,
}: {
  starting: boolean;
  submitting?: boolean;
  notice?: string | null;
  studio: boolean;
  onRetry?: () => void;
}) {
  return (
    <div
      className={
        studio
          ? 'bb-generation-state bb-generation-studio'
          : 'bb-generation-state'
      }
    >
      {studio && (
        <div className="bb-generation-aurora" aria-hidden="true">
          <span className="bb-generation-glow bb-generation-glow-lime" />
          <span className="bb-generation-glow bb-generation-glow-amber" />
          <span className="bb-generation-glow bb-generation-glow-violet" />
        </div>
      )}
      <div className="bb-generation-content">
        <p>
          <LoaderCircle size={18} className="bb-spin" aria-hidden="true" />
          {submitting
            ? 'Submitting your video…'
            : starting
              ? 'Starting your video…'
              : 'Your Burning Bridges AI video is rendering…'}
        </p>
        <small>
          {submitting
            ? 'Please keep this page open while we submit your video.'
            : 'Rendering takes a few minutes and you can close the tab meanwhile. The finished video waits in the studio, ready to download.'}
        </small>
        {studio && !submitting && (
          <Link href="/library" className="bb-generation-library">
            My videos <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        )}
        {notice && <small className="bb-generation-notice">{notice}</small>}
        {onRetry && (
          <button type="button" className="bb-text-link" onClick={onRetry}>
            Check again ↗
          </button>
        )}
      </div>
    </div>
  );
}
