'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { authClient } from '@/lib/auth-client';
import { fetchCurrentStudioVideo } from '@/studio/current-video-query';
import type { PartySceneId } from '@/studio/catalog';
import type { PublicVideoJob } from '@/studio/video-job-contract';
import { VideoCreator } from './video-creator';
import { VideoPreview } from './video-preview';

export function VideoWorkspace({
  generationReady,
  authReady,
  purchasesReady,
}: {
  generationReady: boolean;
  authReady: boolean;
  purchasesReady: boolean;
}) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const userId = session?.user.id;
  const { mutate: updateVideoCache } = useSWRConfig();
  const { data: saved, error, isLoading, isValidating, mutate } = useSWR(
    userId ? ['/api/studio/videos/current', userId] as const : null,
    fetchCurrentStudioVideo,
    {
      revalidateOnMount: true,
      revalidateOnFocus: true,
      onSuccess: ({ video }) => {
        if (video) void updateVideoCache<PublicVideoJob>(
          `/api/studio/videos/${video.id}`,
          (cached) => cached &&
            ['succeeded', 'failed'].includes(cached.status) &&
            ['reserved', 'processing'].includes(video.status)
              ? cached : video,
          { revalidate: false }
        );
      },
    }
  );
  const [selectedSceneId, setSceneId] = useState<PartySceneId | null>(null);
  const [submittedJob, setSubmittedJob] = useState<{
    video: PublicVideoJob;
    userId: string;
  } | null>(null);
  const activeJob = userId
    ? submittedJob?.userId === userId
      ? submittedJob.video
      : saved?.video
    : null;
  const sceneId = selectedSceneId ?? activeJob?.sceneId ?? 'chandelier';
  const jobId = activeJob?.id ?? null;
  const [showResult, setShowResult] = useState(false);
  const [pendingSubmissionUserId, setPendingSubmissionUserId] = useState<
    string | null
  >(null);
  const submitting = Boolean(userId && pendingSubmissionUserId === userId);
  function changeSubmitting(pending: boolean) {
    setPendingSubmissionUserId(pending ? userId ?? null : null);
    if (pending) setShowResult(true);
  }
  function selectJob(video: PublicVideoJob) {
    if (!userId) return;
    setSubmittedJob({ video, userId });
    setPendingSubmissionUserId(null);
    setShowResult(true);
    void mutate({ video }, { revalidate: false });
  }
  return (
    <div className="bb-workspace">
      <VideoCreator
        generationReady={generationReady}
        authReady={authReady}
        purchasesReady={purchasesReady}
        sceneId={sceneId}
        onSceneChange={setSceneId}
        onReferencePreview={() => setShowResult(false)}
        onJobChange={selectJob}
        onSubmittingChange={changeSubmitting}
      />
      <VideoPreview
        key={sceneId}
        sceneId={sceneId}
        jobId={jobId}
        initialJob={activeJob ?? undefined}
        showResult={showResult}
        submitting={submitting}
        onShowResult={setShowResult}
        restoring={sessionPending || Boolean(
          userId && submittedJob?.userId !== userId && (isLoading || isValidating)
        )}
        restoreError={Boolean(error && !jobId)}
        onRestore={() => void mutate()}
      />
    </div>
  );
}
