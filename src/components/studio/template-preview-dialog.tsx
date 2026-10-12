'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { partyScenes, type PartySceneId } from '@/studio/catalog';

export function TemplatePreviewDialog({
  sceneId,
  onClose,
}: {
  sceneId: PartySceneId | null;
  onClose: () => void;
}) {
  const scene = partyScenes.find((scene) => scene.id === sceneId);
  return (
    <Dialog
      open={Boolean(scene)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="bb-dialog bb-template-dialog">
        <DialogTitle>{scene?.name}</DialogTitle>
        <DialogDescription className="sr-only">
          Burning Bridges AI template video preview.
        </DialogDescription>
        {scene && (
          <video
            key={scene.id}
            src={scene.video}
            poster={scene.poster}
            autoPlay
            controls
            playsInline
            preload="metadata"
            aria-label={`Preview ${scene.name}`}
          >
            <track
              kind="captions"
              src="/studio/party-music.vtt"
              srcLang="en"
              label="Sound description"
            />
          </video>
        )}
      </DialogContent>
    </Dialog>
  );
}
