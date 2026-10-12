import { z } from 'zod';

export const mediaUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Media URLs must use HTTPS without credentials.');

export const falEndpoints = [
  'fal-ai/kling-video/o3/standard/video-to-video/edit',
  'fal-ai/kling-video/o3/pro/video-to-video/edit',
  'fal-ai/ffmpeg-api/merge-videos',
  'fal-ai/ffmpeg-api/merge-audio-video',
] as const;
export type FalEndpoint = (typeof falEndpoints)[number];

export const falSubmission = z.object({ request_id: z.string().uuid() });
export const falQueueStatus = z.object({
  request_id: z.string().uuid(),
  status: z.enum(['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED']),
  error: z.string().optional(),
  error_type: z.string().optional(),
});
export const falVideoResult = z.object({ video: z.object({ url: mediaUrl }) });
export const falFailureSchema = z
  .object({
    endpoint: z.enum(falEndpoints),
    requestId: z.string().uuid(),
    source: z.literal('queue-status'),
    status: z.literal('COMPLETED'),
    error: z.string().optional(),
    errorType: z.string().optional(),
  })
  .refine(
    (failure) => Boolean(failure.error?.trim() || failure.errorType?.trim()),
    'A completed fal task must explicitly report an error before a refund.'
  );
export type FalFailure = z.infer<typeof falFailureSchema>;

export function falQueuePath(endpoint: FalEndpoint, requestId: string) {
  z.enum(falEndpoints).parse(endpoint);
  z.string().uuid().parse(requestId);
  // fal 的状态与结果 URL 使用应用根路径，不能把模型子路径带入。
  return `${endpoint.split('/').slice(0, 2).join('/')}/requests/${requestId}`;
}
