import { z } from 'zod';

export const mediaUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Media URLs must use HTTPS without credentials.');

export const falEndpoints = [
  'fal-ai/kling-video/o3/standard/video-to-video/edit',
  'fal-ai/kling-video/o3/pro/video-to-video/edit',
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
    source: z.enum(['queue-status', 'webhook']),
    status: z.enum(['COMPLETED', 'ERROR']),
    error: z.string().optional(),
    errorType: z.string().optional(),
  })
  .refine(
    (failure) => Boolean(failure.error?.trim() || failure.errorType?.trim()) &&
      ((failure.source === 'queue-status' && failure.status === 'COMPLETED') ||
       (failure.source === 'webhook' && failure.status === 'ERROR')),
    'Returning credits through this path requires matching final fal error evidence.'
  );
export type FalFailure = z.infer<typeof falFailureSchema>;

// 只接受能确定发生在HTTP请求发送之前的连接错误，不包含普通超时或连接重置。
export const falUnsentSubmissionSchema = z.object({
  endpoint: z.enum(falEndpoints),
  source: z.literal('transport-before-send'),
  attempts: z.array(z.object({
    codes: z.array(z.enum([
      'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT',
    ])).min(1),
    observedAt: z.iso.datetime(),
  })).length(3),
});
export type FalUnsentSubmission = z.infer<typeof falUnsentSubmissionSchema>;

export function falQueuePath(endpoint: FalEndpoint, requestId: string) {
  z.enum(falEndpoints).parse(endpoint);
  z.string().uuid().parse(requestId);
  // fal 的状态与结果 URL 使用应用根路径，不能把模型子路径带入。
  return `${endpoint.split('/').slice(0, 2).join('/')}/requests/${requestId}`;
}
