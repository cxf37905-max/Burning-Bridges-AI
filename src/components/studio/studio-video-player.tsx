'use client';

import {
  MediaCaptionsButton,
  MediaControlBar,
  MediaController,
  MediaErrorDialog,
  MediaFullscreenButton,
  MediaLoadingIndicator,
  MediaMuteButton,
  MediaPipButton,
  MediaPlaybackRateButton,
  MediaPlayButton,
  MediaTextDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from 'media-chrome/react';
import { type SyntheticEvent, useState } from 'react';

function formatPlaybackTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, '0');
  if (minutes < 60) return `${minutes}:${remainder}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${remainder}`;
}

export function StudioVideoPlayer({ src }: { src: string }) {
  const [clock, setClock] = useState<{
    elapsed: number;
    duration: number | null;
  }>({ elapsed: 0, duration: null });

  function updatePlaybackClock(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    const duration = Number.isFinite(video.duration)
      ? Math.max(0, Math.round(video.duration))
      : null;
    // 取整仅用于文案；拖动、播放和结束判断始终由真实视频时长决定。
    const elapsed =
      duration === null
        ? 0
        : Math.min(duration, Math.max(0, Math.round(video.currentTime)));
    setClock((previous) =>
      previous.elapsed === elapsed && previous.duration === duration
        ? previous
        : { elapsed, duration }
    );
  }

  return (
    <MediaController
      className="bb-video-player"
      aria-label="Your generated Burning Bridges AI video"
      aria-live="off"
      lang="en"
    >
      <video
        slot="media"
        src={src}
        playsInline
        preload="metadata"
        aria-label="Your generated Burning Bridges AI video"
        onLoadedMetadata={updatePlaybackClock}
        onDurationChange={updatePlaybackClock}
        onTimeUpdate={updatePlaybackClock}
        onSeeked={updatePlaybackClock}
        onEnded={updatePlaybackClock}
        onEmptied={() => setClock({ elapsed: 0, duration: null })}
      >
        <track
          kind="captions"
          src="/studio/party-music.vtt"
          srcLang="en"
          label="Sound description"
        />
      </video>
      <MediaLoadingIndicator slot="centered-chrome" />
      <MediaErrorDialog slot="dialog" />
      <MediaControlBar className="bb-video-seek-bar">
        <MediaTimeRange aria-label="Seek video" />
      </MediaControlBar>
      <MediaControlBar className="bb-video-controls">
        <MediaPlayButton />
        <MediaTextDisplay className="bb-video-time">
          {formatPlaybackTime(clock.elapsed)} /{' '}
          {clock.duration === null ? '--:--' : formatPlaybackTime(clock.duration)}
        </MediaTextDisplay>
        <span className="bb-video-control-spacer" aria-hidden="true" />
        <MediaMuteButton />
        <MediaVolumeRange />
        <MediaPlaybackRateButton />
        <MediaCaptionsButton />
        <MediaPipButton />
        <MediaFullscreenButton />
      </MediaControlBar>
    </MediaController>
  );
}
