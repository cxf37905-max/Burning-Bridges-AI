'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { publicVideoJobSchema, type PublicVideoJob } from '@/studio/video-job-contract';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { creditsKeys, useCreditBalance } from '@/hooks/use-credits';
import {
  clearPhotoDraft,
  readPhotoDraft,
  savePhotoDraft,
} from '@/studio/photo-draft';
import Image from 'next/image';
import { RouteLink as Link } from '@/components/layout/locale-link';
import { ArrowRight, Check, LoaderCircle, Play, Plus, X } from 'lucide-react';
import {
  partyScenes,
  videoCreditCost,
  type PartySceneId,
} from '@/studio/catalog';
import {
  photoDimensionsError,
  photoFileError,
} from '@/studio/photo-validation';

const TemplatePreviewDialog = dynamic(
  () =>
    import('./template-preview-dialog').then(
      (module) => module.TemplatePreviewDialog
    ),
  { ssr: false }
);
const StudioSigninDialog = dynamic(
  () =>
    import('./studio-signin-dialog').then((module) => module.StudioSigninDialog),
  { ssr: false }
);
const CreditPackDialog = dynamic(
  () =>
    import('./credit-pack-dialog').then((module) => module.CreditPackDialog),
  { ssr: false }
);

interface SelectedPhoto {
  file: File;
  url: string;
  width: number;
  height: number;
}

async function readPhoto(file: File): Promise<SelectedPhoto> {
  const error = photoFileError(file);
  if (error) throw new Error(error);
  const bitmap = await createImageBitmap(file);
  const dimensionsError = photoDimensionsError(bitmap.width, bitmap.height);
  const { width, height } = bitmap;
  bitmap.close();
  if (dimensionsError) throw new Error(dimensionsError);
  // 数据 URL 不占用需要额外清理的对象 URL；这里只在浏览器中预览照片。
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error('Could not read this photo. Choose another file.'));
    reader.readAsDataURL(file);
  });
  return { file, url, width, height };
}

export function VideoCreator({
  generationReady,
  authReady,
  purchasesReady,
  sceneId,
  onSceneChange: setSceneId,
  onReferencePreview,
  onJobChange: setJobId,
  onSubmittingChange,
}: {
  generationReady: boolean;
  authReady: boolean;
  purchasesReady: boolean;
  sceneId: PartySceneId;
  onSceneChange: (id: PartySceneId) => void;
  onJobChange: (job: PublicVideoJob) => void;
  onReferencePreview: () => void;
  onSubmittingChange: (submitting: boolean) => void;
}) {
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [previewSceneId, setPreviewSceneId] = useState<PartySceneId | null>(
    null
  );
  const [signinOpen, setSigninOpen] = useState(false);
  const {
    data: session,
    isPending: sessionPending,
    error: sessionError,
    refetch: refreshSession,
  } = authClient.useSession();
  const user = session?.user;
  const {
    data: credits,
    error: creditsError,
    refetch: refreshCredits,
  } = useCreditBalance(user?.id);
  const [error, setError] = useState('');
  const [needsPack, setNeedsPack] = useState(false);
  const [restored, setRestored] = useState(false);
  const [reading, setReading] = useState(false);
  const [consent, setConsent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionVersion = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const requestId = useRef<string | null>(null);
  const submitLock = useRef(false);
  const draftRestored = useRef(false);
  const queryClient = useQueryClient();
  useSWR(['studio-photo-draft', user?.id ?? 'anonymous'], readPhotoDraft, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    onSuccess: (draft) => {
      if (
        !draft ||
        (draft.userId && draft.userId !== user?.id) ||
        draftRestored.current ||
        selectionVersion.current !== 0
      )
        return;
      draftRestored.current = true;
      const version = selectionVersion.current;
      readPhoto(draft.file)
        .then((selection) => {
          if (selectionVersion.current !== version) return;
          setPhoto(selection);
          setSceneId(draft.sceneId);
          setConsent(false);
          requestId.current = draft.jobId ? null : draft.requestId;
          setRestored(true);
        })
        .catch((reason: Error) => setError(reason.message));
    },
    onError: (reason: Error) => setError(reason.message),
  });

  async function preservePhotoDraft() {
    if (!photo) return;
    requestId.current ||= crypto.randomUUID();
    await savePhotoDraft({
      file: photo.file,
      sceneId,
      consent,
      requestId: requestId.current,
      savedAt: Date.now(),
      userId: user?.id,
    });
  }

  async function createVideo() {
    if (
      submitLock.current ||
      reading ||
      sessionPending ||
      (sessionError && !user)
    )
      return;
    setError('');
    if (!user) {
      try {
        await preservePhotoDraft();
        setSigninOpen(true);
      } catch {
        setError(
          'Your photo could not be saved for sign-in. Please try again.'
        );
      }
      return;
    }
    if (!photo) {
      setError(
        'Add a photo first. One person, head to waist in frame, works best.'
      );
      return;
    }
    if (!consent) {
      setError('Tick the box to confirm you are allowed to use this photo.');
      return;
    }
    if (credits === undefined) {
      setError('Your credits are still loading. Please try again.');
      void refreshCredits();
      return;
    }
    if (credits < videoCreditCost) {
      setNeedsPack(true);
      return;
    }
    if (!generationReady) {
      setError('Video generation is not available in preview yet.');
      return;
    }
    submitLock.current = true;
    requestId.current ||= crypto.randomUUID();
    const generationRequestId = requestId.current;
    const form = new FormData();
    form.set('photo', photo.file);
    form.set('sceneId', sceneId);
    form.set('consent', 'true');
    form.set('requestId', generationRequestId);
    setSubmitting(true);
    onSubmittingChange(true);
    setError('');
    setNeedsPack(false);
    try {
      await savePhotoDraft({
        file: photo.file,
        sceneId,
        consent,
        requestId: generationRequestId,
        savedAt: Date.now(),
        userId: user.id,
      });
      const response = await fetch('/api/studio/videos', {
        method: 'POST',
        body: form,
      });
      if (response.status === 401) {
        setSigninOpen(true);
        void refreshSession();
        return;
      }
      const result = await response.json();
      if (response.status === 402) setNeedsPack(true);
      if (!response.ok || typeof result.id !== 'string')
        throw new Error(
          result.error ||
            'This video could not be submitted. Retry the same video or check your library.'
        );
      setJobId(publicVideoJobSchema.parse(result));
      requestId.current = null;
      setRestored(false);
      try {
        await savePhotoDraft({
          file: photo.file,
          sceneId,
          consent,
          requestId: generationRequestId,
          savedAt: Date.now(),
          userId: user.id,
          jobId: result.id,
        });
      } catch {
        setError(
          'Your video is saved in My videos, but this browser could not keep your photo.'
        );
      }
      void queryClient.invalidateQueries({
        queryKey: creditsKeys.balance(user.id),
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'This video could not be submitted.'
      );
    } finally {
      submitLock.current = false;
      setSubmitting(false);
      onSubmittingChange(false);
    }
  }

  function selectScene(id: PartySceneId) {
    if (submitting) return;
    selectionVersion.current++;
    setSceneId(id);
    onReferencePreview();
    void clearPhotoDraft().catch((reason: Error) => setError(reason.message));
    requestId.current = null;
  }

  async function selectPhoto(file?: File) {
    if (!file || submitting) return;
    const version = ++selectionVersion.current;
    requestId.current = null;
    setError('');
    setReading(true);
    setRestored(false);
    setNeedsPack(false);
    try {
      const selection = await readPhoto(file);
      if (version === selectionVersion.current) {
        setPhoto(selection);
        await clearPhotoDraft();
      }
    } catch (reason) {
      if (version === selectionVersion.current) {
        setPhoto(null);
        setError(
          reason instanceof Error
            ? reason.message
            : 'This photo could not be opened.'
        );
      }
    } finally {
      if (version === selectionVersion.current) setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <section id="studio" className="bb-studio" aria-labelledby="studio-title">
      <div className="bb-creator-header">
        <h2 id="studio-title">Make your Burning Bridges AI video</h2>
      </div>
      <div className="bb-creator-grid">
        <div className="bb-creator-step">
          <div className="bb-step-heading">
            <span>01</span>
            <h3>Your photo</h3>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="bb-file-input"
            id="party-photo"
            disabled={submitting}
            onChange={(event) => selectPhoto(event.target.files?.[0])}
            aria-label="Upload a photo for your Burning Bridges AI video"
          />
          <div
            className={`bb-upload ${dragging ? 'is-dragging' : ''} ${photo ? 'has-photo' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              selectPhoto(event.dataTransfer.files[0]);
            }}
          >
            {photo ? (
              <>
                <img
                  src={photo.url}
                  alt="Your selected photo, only previewed on this device"
                  className="bb-selected-photo"
                />
                <button
                  type="button"
                  className="bb-remove-photo"
                  aria-label="Remove selected photo"
                  disabled={submitting}
                  onClick={() => {
                    selectionVersion.current++;
                    setPhoto(null);
                    setRestored(false);
                    void clearPhotoDraft().catch((reason: Error) =>
                      setError(reason.message)
                    );
                    setReading(false);
                    setError('');
                    requestId.current = null;
                  }}
                >
                  <X size={15} />
                </button>
                <button
                  type="button"
                  className="bb-replace-photo"
                  disabled={submitting}
                  onClick={() => inputRef.current?.click()}
                >
                  Change photo
                </button>
              </>
            ) : (
              <button
                type="button"
                className="bb-upload-button"
                onClick={() => inputRef.current?.click()}
                disabled={reading}
                aria-label="Upload a photo"
                aria-busy={reading}
              >
                {reading ? (
                  <LoaderCircle className="bb-spin" size={26} />
                ) : (
                  <span className="bb-upload-icon" aria-hidden="true">
                    <Plus size={20} strokeWidth={2} />
                  </span>
                )}
                <strong>{reading ? 'Preparing photo…' : 'Add photo'}</strong>
              </button>
            )}
          </div>
          <p className="bb-photo-help">
            {photo
              ? `${photo.width} × ${photo.height} · ready for your close-up`
              : 'One person or pet, head to waist in frame, good light. JPG, PNG or WebP.'}
          </p>
          {error && (
            <p className="bb-form-error" role="alert">
              {error}
            </p>
          )}
          {restored && (
            <p className="bb-photo-help">
              Your photo and scene are restored. Review them, then create your
              video when ready.
            </p>
          )}
        </div>
        <fieldset className="bb-creator-step bb-scene-selector">
          <legend className="bb-step-heading">
            <span>02</span>
            <h3>Template</h3>
          </legend>
          <div className="bb-scene-options">
            {partyScenes.map((scene) => (
              <div key={scene.id} className="bb-template-choice">
                <label
                  className={`bb-scene-option ${scene.id === sceneId ? 'is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="party-scene"
                    value={scene.id}
                    checked={sceneId === scene.id}
                    onClick={onReferencePreview}
                    onChange={() => selectScene(scene.id)}
                    disabled={submitting}
                  />
                  <span className="bb-scene-thumb">
                    <Image
                      src={scene.poster}
                      alt=""
                      fill
                      sizes="(max-width: 700px) 45px, (max-width: 1080px) 38px, 48px"
                      style={{ objectPosition: scene.posterPosition }}
                    />
                  </span>
                  <span className="bb-scene-option-text">
                    <strong>{scene.name}</strong>
                  </span>
                  <span className="bb-radio-mark">
                    {sceneId === scene.id && <Check size={13} />}
                  </span>
                </label>
                <button
                  type="button"
                  className="bb-template-preview"
                  aria-label={`Preview ${scene.name}`}
                  disabled={submitting}
                  onClick={() => {
                    selectScene(scene.id);
                    setPreviewSceneId(scene.id);
                  }}
                >
                  <Play size={9} fill="currentColor" /> Preview
                </button>
              </div>
            ))}
          </div>
        </fieldset>
        <div className="bb-creator-step bb-create-summary">
          <h3 className="bb-quality-label">Quality</h3>
          <div className="bb-video-quality">
            <span className="bb-video-quality-name">HD 720p</span>
            <span className="bb-video-quality-credits">
              {videoCreditCost} credits
            </span>
          </div>
          <label className="bb-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              I only use photos of myself or of people who agreed to appear, and
              I accept the <Link href="/terms" prefetch={false}>Terms</Link>. The video is
              AI-generated, not real footage.
            </span>
          </label>
          <button
            type="button"
            className="bb-button bb-create-button"
            disabled={
              reading || submitting || sessionPending || (!user && !!sessionError)
            }
            onClick={createVideo}
            aria-busy={submitting}
          >
            {submitting
              ? 'Submitting your video…'
              : sessionPending || (!user && sessionError)
                ? sessionError
                  ? 'Could not load your account'
                  : 'Loading your account…'
                : user
                  ? `Generate video · ${videoCreditCost} credits`
                  : 'Sign in to make your video'}
            <ArrowRight size={17} />
          </button>
          {user && creditsError && credits === undefined && (
            <button
              type="button"
              className="bb-text-link"
              onClick={() => void refreshCredits()}
            >
              Could not load credits. Try again
            </button>
          )}
        </div>
      </div>
      {previewSceneId && (
        <TemplatePreviewDialog
          sceneId={previewSceneId}
          onClose={() => setPreviewSceneId(null)}
        />
      )}
      {signinOpen && (
        <StudioSigninDialog
          open={signinOpen}
          onOpenChange={setSigninOpen}
          authReady={authReady}
        />
      )}
      {needsPack && (
        <CreditPackDialog
          open={needsPack}
          onOpenChange={setNeedsPack}
          purchasesReady={purchasesReady}
          balance={credits ?? 0}
          beforeCheckout={preservePhotoDraft}
        />
      )}
    </section>
  );
}
