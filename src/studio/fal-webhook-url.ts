import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const falWebhookContext = z.object({
  videoId: z.string().regex(/^[a-f0-9]{32}$/),
  stepId: z.enum(['segment-1', 'segment-2']),
  submissionId: z.uuid(),
});
export type FalWebhookContext = z.infer<typeof falWebhookContext>;

export function falWebhookOrigin() {
  const address = process.env.FAL_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (!address || !URL.canParse(address)) return null;
  const url = new URL(address);
  if (
    url.protocol !== 'https:' || url.username || url.password ||
    url.search || url.hash || url.pathname !== '/' ||
    /^(localhost|127\..*|\[::1\])$/i.test(url.hostname)
  ) return null;
  return url.origin;
}

export function assertFalWebhookConfigured() {
  if (!falWebhookOrigin())
    throw new Error('FAL_WEBHOOK_BASE_URL must be a public HTTPS origin for generation callbacks.');
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32)
    throw new Error('CRON_SECRET must contain at least 32 characters for generation callbacks.');
}

function contextToken(context: FalWebhookContext) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('Generation callback signing secret is unavailable.');
  return createHmac('sha256', secret)
    .update(`fal-webhook:${context.videoId}:${context.stepId}:${context.submissionId}`)
    .digest('hex');
}

export function createFalWebhookUrl(context: FalWebhookContext) {
  assertFalWebhookConfigured();
  falWebhookContext.parse(context);
  const url = new URL('/api/webhooks/fal', falWebhookOrigin()!);
  for (const [name, value] of Object.entries(context)) url.searchParams.set(name, value);
  url.searchParams.set('token', contextToken(context));
  return url.href;
}

export function verifyFalWebhookContext(context: FalWebhookContext, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const supplied = Buffer.from(token, 'hex');
  const expected = Buffer.from(contextToken(context), 'hex');
  return timingSafeEqual(supplied, expected);
}
