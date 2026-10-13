'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { authClient } from '@/lib/auth-client';
import { fetchCurrentStudioVideo } from '@/studio/current-video-query';
import type { PartySceneId } from '@/studio/catalog';
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
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  const { data: saved, error, isLoading, mutate } = useSWR(
    userId ? ['/api/studio/videos/current', userId] as const : null,
    fetchCurrentStudioVideo,
    { revalidateOnMount: true, revalidateOnFocus: true }
  );
  const [selectedSceneId, setSceneId] = useState<PartySceneId | null>(null);
  const [submittedJob, setSubmittedJob] = useState<{
    id: string;
    sceneId: PartySceneId;
    userId: string;
  } | null>(null);
  const activeJob = userId
    ? submittedJob?.userId === userId
      ? submittedJob
      : saved?.video
    : null;
  const sceneId = selectedSceneId ?? activeJob?.sceneId ?? 'chandelier';
  const jobId = activeJob?.id ?? null;
  const [showResult, setShowResult] = useState(true);
  const [pendingSubmissionUserId, setPendingSubmissionUserId] = useState<
    string | null
  >(null);
  const submitting = Boolean(userId && pendingSubmissionUserId === userId);
  function changeSubmitting(pending: boolean) {
    setPendingSubmissionUserId(pending ? userId ?? null : null);
    if (pending) setShowResult(true);
  }
  function selectJob(id: string) {
    if (!userId) return;
    const video = { id, sceneId };
    setSubmittedJob({ ...video, userId });
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
        onJobChange={selectJob}
        onSubmittingChange={changeSubmitting}
      />
      <VideoPreview
        key={sceneId}
        sceneId={sceneId}
        jobId={jobId}
        showResult={showResult}
        submitting={submitting}
        onShowResult={setShowResult}
        restoring={Boolean(userId && isLoading && !jobId)}
        restoreError={Boolean(error && !jobId)}
        onRestore={() => void mutate()}
      />
    </div>
  );
}
