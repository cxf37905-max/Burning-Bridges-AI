'use client';

import useSWR from 'swr';
import { useQueryClient } from '@tanstack/react-query';
import { creditsKeys } from '@/hooks/use-credits';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { z } from 'zod';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoGenerationState } from './video-generation-state';

const StudioVideoPlayer = dynamic(
  () => import('./studio-video-player').then((module) => module.StudioVideoPlayer),
  {
    ssr: false,
    loading: () => (
      <Skeleton
        className="bb-video-player-loading"
        aria-label="Loading video player"
      />
    ),
  }
);

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
  appearance = 'library',
}: {
  id: string;
  appearance?: 'studio' | 'library';
}) {
  const queryClient = useQueryClient();
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
    onSuccess: (latest) => {
      if (latest.status === 'succeeded' || latest.status === 'failed')
        void queryClient.invalidateQueries({ queryKey: creditsKeys.all });
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
      {!job || ['reserved', 'processing'].includes(job.status) ? (
        <VideoGenerationState
          starting={job?.status === 'reserved'}
          studio={appearance === 'studio'}
          notice={
            error
              ? 'Connection interrupted. We’ll keep checking your video.'
              : job?.message === 'Creating your Burning Bridges AI video…'
                ? null
                : job?.message
          }
          onRetry={error ? () => void mutate() : undefined}
        />
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
          <StudioVideoPlayer key={job.videoUrl} src={job.videoUrl} />
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
    </div>
  );
}
