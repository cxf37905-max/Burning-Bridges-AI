export const klingScenes = ['chandelier', 'after-hours'] as const;
export type KlingScene = (typeof klingScenes)[number];

export function getKlingTemplate(sceneId: string) {
  if (sceneId === 'chandelier')
    return {
      sceneId,
      singleReference: {
        filename: 'burning-bridges-ref-15s.mp4',
        audioFilename: 'burning-bridges-ref-15s-audio.m4a',
        seconds: 15,
      },
      width: 720,
      height: 1280,
      fps: 24,
    };
  if (sceneId === 'after-hours')
    return {
      sceneId,
      singleReference: {
        filename: 'burning-bridges-after-party-ref-15s.mp4',
        audioFilename: 'burning-bridges-after-party-ref-15s-audio.m4a',
        seconds: 15,
      },
      width: 1280,
      height: 720,
      fps: 24,
    };
  throw new Error(`Unknown Kling scene: ${sceneId}`);
}
