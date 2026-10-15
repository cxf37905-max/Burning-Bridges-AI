'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowUpRight, Clapperboard } from 'lucide-react';
import { RouteLink as Link } from '@/components/layout/locale-link';
import { VideoPlayerPlaceholder } from './video-player-placeholder';
import type { PublicVideoJob } from '@/studio/video-job-contract';
import { partyScenes, type PartySceneId } from '@/studio/catalog';
import { VideoGenerationState } from './video-generation-state';

const VideoJobStatus = dynamic(
  () => import('./video-job-status').then((module) => module.VideoJobStatus),
  { loading: VideoPlayerPlaceholder }
);

export function VideoPreview({
  sceneId,
  jobId,
  initialJob,
  showResult,
  submitting,
  onShowResult,
  restoring,
  restoreError,
  onRestore,
}: {
  sceneId: PartySceneId;
  jobId: string | null;
  initialJob?: PublicVideoJob;
  showResult: boolean;
  submitting: boolean;
  onShowResult: (show: boolean) => void;
  restoring: boolean;
  restoreError: boolean;
  onRestore: () => void;
}) {
  const scene = partyScenes.find((scene) => scene.id === sceneId)!;
  const [unavailable, setUnavailable] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const hasVideo = Boolean(jobId || submitting);
  useEffect(() => {
    if (!showResult) resultRef.current?.querySelector('video')?.pause();
  }, [showResult]);
  return (
    <aside className="bb-effect" id="effect" aria-label="Video preview">
      <div className="bb-effect-heading">
        <span>
          <Clapperboard size={15} />{' '}
          {showResult && hasVideo ? 'YOUR VIDEO' : 'PREVIEW'}
        </span>
        <span className="bb-effect-live">
          <span /> HD 720p
        </span>
      </div>
      {hasVideo && (
        <div className="bb-preview-tabs">
          <button
            type="button"
            aria-pressed={!showResult}
            onClick={() => {
              resultRef.current?.querySelector('video')?.pause();
              onShowResult(false);
            }}
          >
            Reference
          </button>
          <button
            type="button"
            aria-pressed={showResult}
            onClick={() => onShowResult(true)}
          >
            Your video
          </button>
        </div>
      )}
      {submitting && showResult && (
        <div className="bb-result-player">
          <div className="bb-job-status" role="status" aria-live="polite">
            <VideoGenerationState starting submitting studio />
          </div>
        </div>
      )}
      {jobId && !submitting && (
        <div ref={resultRef} className="bb-result-player" hidden={!showResult}>
          <VideoJobStatus key={jobId} id={jobId} initialJob={initialJob} checkingStatus={restoring} appearance="studio" />
        </div>
      )}
      {!hasVideo && showResult && (restoring || restoreError) ? (
        <div className="bb-result-player" aria-live="polite">
          {restoreError ? (
            <>
              <p>Your studio could not be restored.</p>
              <button type="button" className="bb-text-link" onClick={onRestore}>
                Try again ↗
              </button>
              <Link href="/library" className="bb-text-link">
                My videos ↗
              </Link>
            </>
          ) : (
            <VideoPlayerPlaceholder />
          )}
        </div>
      ) : (!showResult || !hasVideo) && (
        <div
          className={`bb-effect-player ${sceneId === 'after-hours' ? 'bb-effect-landscape' : ''}`}
        >
          {unavailable ? (
            <div className="bb-video-unavailable">
              <p>The preview could not load.</p>
              <a href={scene.video} target="_blank" rel="noopener noreferrer">
                Open template video <ArrowUpRight size={15} />
              </a>
            </div>
          ) : (
            <video
              key={sceneId}
              src={scene.previewVideo}
              poster={scene.previewPoster}
              autoPlay
              muted
              loop
              playsInline
              controls
              preload="metadata"
              aria-label={`Burning Bridges AI example video: ${scene.name}`}
              onError={() => setUnavailable(true)}
            />
          )}
        </div>
      )}
      <div className="bb-effect-caption">
        {showResult && hasVideo && <h2>Your Burning Bridges AI video</h2>}
        {(!showResult || !hasVideo) && (
          <p>
            The Burning Bridges motion every video copies. You only add the
            photo.
          </p>
        )}
      </div>
    </aside>
  );
}
