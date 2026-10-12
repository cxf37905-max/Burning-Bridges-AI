'use client';

import { useState } from 'react';
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
  const [sceneId, setSceneId] = useState<PartySceneId>('chandelier');
  const [jobId, setJobId] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  function selectJob(id: string | null) {
    setJobId(id);
    setShowResult(id !== null);
  }
  return (
    <div className="bb-workspace">
      <VideoCreator
        generationReady={generationReady}
        authReady={authReady}
        purchasesReady={purchasesReady}
        sceneId={sceneId}
        onSceneChange={setSceneId}
        jobId={jobId}
        onJobChange={selectJob}
      />
      <VideoPreview
        key={sceneId}
        sceneId={sceneId}
        jobId={jobId}
        showResult={showResult}
        onShowResult={setShowResult}
      />
    </div>
  );
}
