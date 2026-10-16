import { after } from 'next/server';
import { falWebhookPayload, FalWebhookError, recordFalWebhook } from '@/studio/fal-webhook';
import { falWebhookContext, verifyFalWebhookContext } from '@/studio/fal-webhook-url';
import { verifyFalWebhookSignature } from '@/studio/fal-webhook-signature';
import { completeCallbackVideo } from '@/studio/video-jobs';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function webhookBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new FalWebhookError('Generation callback body is required.', 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      // O3回调只含结果地址和错误元数据，不接受视频二进制或无限请求体。
      if (bytes > 1024 * 1024) {
        await reader.cancel();
        throw new FalWebhookError('Generation callback body exceeds 1MB.', 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes);
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const context = falWebhookContext.safeParse({
      videoId: url.searchParams.get('videoId'),
      stepId: url.searchParams.get('stepId'),
      submissionId: url.searchParams.get('submissionId'),
    });
    if (!context.success || !verifyFalWebhookContext(context.data, url.searchParams.get('token') || ''))
      throw new FalWebhookError('Generation callback context is invalid.', 401);
    const body = await webhookBody(request);
    if (!(await verifyFalWebhookSignature(request.headers, body)))
      throw new FalWebhookError('Generation callback signature is invalid.', 401);
    let decoded: unknown;
    try {
      decoded = JSON.parse(body.toString('utf8'));
    } catch (reason) {
      if (!(reason instanceof SyntaxError)) throw reason;
      throw new FalWebhookError('Generation callback is not valid JSON.', 400);
    }
    const parsed = falWebhookPayload.safeParse(decoded);
    if (!parsed.success) throw new FalWebhookError('Generation callback payload is invalid.', 400);
    const headerId = request.headers.get('x-fal-webhook-request-id');
    if (headerId !== parsed.data.request_id && headerId !== parsed.data.gateway_request_id)
      throw new FalWebhookError('Generation callback header identity does not match.', 401);
    const pending = await recordFalWebhook(context.data, parsed.data);
    if (pending) {
      after(async () => {
        try {
          await completeCallbackVideo(context.data);
        } catch (reason) {
          // 不将带私有签名地址的底层异常输出到日志；非 2xx 已保留重投机会。
          const kind = reason instanceof Error ? reason.name : 'UnknownError';
          throw new Error(`视频 ${context.data.videoId} 回调后处理待重试（${kind}）。`);
        }
      });
      // 成片保存或退款落库前不确认投递完成，避免函数中断后永久丢失后处理。
      return Response.json({ received: true, processing: true }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '10' },
      });
    }
    return Response.json({ received: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (reason) {
    if (reason instanceof FalWebhookError)
      return Response.json({ error: reason.message }, { status: reason.status });
    throw reason;
  }
}
