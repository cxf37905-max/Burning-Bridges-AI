'use client';

import { useState } from 'react';
import { ArrowUpRight, Clapperboard } from 'lucide-react';
import { partyScenes, type PartySceneId } from '@/studio/catalog';
import { VideoJobStatus } from './video-job-status';

export function VideoPreview({
  sceneId,
  jobId,
  showResult,
  onShowResult,
}: {
  sceneId: PartySceneId;
  jobId: string | null;
  showResult: boolean;
  onShowResult: (show: boolean) => void;
}) {
  const scene = partyScenes.find((scene) => scene.id === sceneId)!;
  const [unavailable, setUnavailable] = useState(false);
  return (
    <aside className="bb-effect" id="effect" aria-label="Video preview">
      <div className="bb-effect-heading">
        <span>
          <Clapperboard size={15} />{' '}
          {showResult && jobId ? 'YOUR VIDEO' : 'PREVIEW'}
        </span>
        <span className="bb-effect-live">
          <span /> HD 720p
        </span>
      </div>
      {jobId && (
        <div className="bb-preview-tabs">
          <button
            type="button"
            aria-pressed={!showResult}
            onClick={() => onShowResult(false)}
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
      {showResult && jobId ? (
        <div className="bb-result-player">
          <VideoJobStatus id={jobId} />
        </div>
      ) : (
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
              src={scene.video}
              poster={scene.poster}
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
        {showResult && jobId && <h2>Your Burning Bridges AI video</h2>}
        {!showResult && (
          <p>
            The Burning Bridges motion every video copies. You only add the
            photo.
          </p>
        )}
      </div>
    </aside>
  );
}
