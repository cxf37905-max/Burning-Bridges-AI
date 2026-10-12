'use client';

import useSWR, { useSWRConfig } from 'swr';
import { useState } from 'react';
import { LoaderCircle, Download } from 'lucide-react';
import { z } from 'zod';

const videoJob = z.object({
  id: z.string(),
  status: z.enum(['reserved', 'processing', 'succeeded', 'failed']),
  videoUrl: z.url().nullable(),
  message: z.string().nullable(),
  refunded: z.boolean(),
  expired: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
});

async function fetchVideoJob(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok)
    throw new Error(
      'We could not check this video. Try again, or return to your library.'
    );
  return videoJob.parse(await response.json());
}

export function VideoJobStatus({
  id,
  onNewTake,
}: {
  id: string;
  onNewTake?: () => void;
}) {
  const { mutate: refreshCache } = useSWRConfig();
  const [downloading, setDownloading] = useState(false);
  const {
    data: job,
    error,
    mutate,
  } = useSWR(`/api/studio/videos/${id}`, fetchVideoJob, {
    refreshInterval: (latest) =>
      latest && ['succeeded', 'failed'].includes(latest.status) ? 0 : 8_000,
    shouldRetryOnError: true,
    onErrorRetry: (_error, _key, _config, revalidate, { retryCount }) => {
      setTimeout(() => revalidate({ retryCount }), 8_000);
    },
    onSuccess: () => {
      void refreshCache('/api/studio/account');
    },
  });

  async function downloadVideo() {
    if (!job?.videoUrl || downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(job.videoUrl);
      if (!response.ok)
        throw new Error(`Video download failed: ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `burning-bridges-ai-${id}.mp4`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      // 跨域下载受限时，保留浏览器直接打开成片的入口。
      window.open(job.videoUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div className="bb-job-status" aria-live="polite">
      {error && !job ? (
        <>
          <p>Connection interrupted. We’ll keep checking your video.</p>
          <button
            type="button"
            className="bb-text-link"
            onClick={() => mutate()}
          >
            Check again ↗
          </button>
        </>
      ) : !job || ['reserved', 'processing'].includes(job.status) ? (
        <>
          <p>
            <LoaderCircle size={15} className="bb-spin" />{' '}
            {job?.status === 'reserved'
              ? 'Starting your video…'
              : 'Your Burning Bridges AI video is rendering…'}
          </p>
          <small>
            {(error
              ? 'Connection interrupted. We’ll keep checking your video.'
              : job?.message) ||
              'This can take a few minutes. You can close this page and come back later.'}
          </small>
        </>
      ) : job.status === 'failed' ? (
        <p role="alert">
          {job.message ||
            (job.refunded
              ? 'This video could not be generated. Your 100 credits have been returned to your balance.'
              : 'This video could not be generated.')}
        </p>
      ) : job.expired ? (
        <p>This video has expired after 14 days and is no longer available.</p>
      ) : job.videoUrl ? (
        <>
          <p>Your Burning Bridges AI video is ready.</p>
          <video
            src={job.videoUrl}
            controls
            playsInline
            preload="metadata"
            aria-label="Your generated Burning Bridges AI video"
          >
            <track
              kind="captions"
              src="/studio/party-music.vtt"
              srcLang="en"
              label="Sound description"
            />
          </video>
          <button
            type="button"
            className="bb-text-link"
            onClick={downloadVideo}
            disabled={downloading}
          >
            {downloading ? 'Downloading…' : 'Download video'}{' '}
            <Download size={14} />
          </button>
          <small>
            Available for 14 days. Download your video before it expires.
          </small>
        </>
      ) : null}
      {onNewTake && job && (
        <button type="button" className="bb-text-link" onClick={onNewTake}>
          {['reserved', 'processing'].includes(job.status)
            ? 'Keep this video in my library · create another ↗'
            : 'Make another video ↗'}
        </button>
      )}
    </div>
  );
}
