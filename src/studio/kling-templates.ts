export const klingScenes = ['chandelier', 'after-hours'] as const;
export type KlingScene = (typeof klingScenes)[number];

// 用户已确认这些远程素材的使用授权；只向服务商提供链接。
const referenceOrigin = 'https://burningbridgesai.app/videos';

export function getKlingTemplate(sceneId: string) {
  if (sceneId === 'chandelier')
    return {
      sceneId,
      segments: [
        { url: `${referenceOrigin}/burning-bridges-ref-1.mp4`, seconds: 12 },
        {
          url: `${referenceOrigin}/burning-bridges-ref-2.mp4`,
          seconds: 193 / 24,
        },
      ],
      audioUrl: `${referenceOrigin}/burning-bridges-ref-audio.m4a`,
      overlapReference: {
        filename: 'burning-bridges-ref-2-overlap.mp4',
        frames: 24 as const,
      },
      width: 720,
      height: 1280,
      fps: 24,
    };
  if (sceneId === 'after-hours')
    return {
      sceneId,
      segments: [
        {
          url: `${referenceOrigin}/burning-bridges-after-party-ref-1.mp4`,
          seconds: 13,
        },
        {
          url: `${referenceOrigin}/burning-bridges-after-party-ref-2.mp4`,
          seconds: 7,
        },
      ],
      audioUrl: `${referenceOrigin}/burning-bridges-after-party-ref-audio.m4a`,
      overlapReference: {
        filename: 'burning-bridges-after-party-ref-2-overlap.mp4',
        frames: 24 as const,
      },
      width: 1280,
      height: 720,
      fps: 24,
    };
  throw new Error(`Unknown Kling scene: ${sceneId}`);
}
