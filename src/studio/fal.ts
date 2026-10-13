import 'server-only';
import { createFalClient } from '@fal-ai/client';
import {
  falEndpoints,
  falQueuePath,
  falQueueStatus,
  falSubmission,
  falFailureSchema,
  mediaUrl,
  type FalEndpoint,
  type FalFailure,
  type FalUnsentSubmission,
} from './fal-contract';
import { FalSubmissionNotSentError, unsentConnectionCodes } from './fal-submission-error';

export class FalRequestError extends Error {
  constructor(public readonly status: number) {
    super(`Generation service returned HTTP ${status}.`);
  }
}

export class FalTaskFailedError extends Error {
  public readonly failure: FalFailure;

  constructor(failure: FalFailure) {
    super(`Generation task failed: ${failure.requestId}`);
    this.failure = falFailureSchema.parse(failure);
  }
}

function falKey() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error('Missing server configuration: FAL_KEY');
  return key;
}

async function requestFal(path: string, input?: Record<string, unknown>) {
  const response = await fetch(`https://queue.fal.run/${path}`, {
    method: input ? 'POST' : 'GET',
    headers: {
      Authorization: `Key ${falKey()}`,
      ...(input ? { 'Content-Type': 'application/json' } : {}),
    },
    body: input ? JSON.stringify(input) : undefined,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new FalRequestError(response.status);
  return response.json() as Promise<unknown>;
}

export async function submitFalTask(
  endpoint: FalEndpoint,
  input: Record<string, unknown>,
  webhookUrl?: string
) {
  if (!(falEndpoints as readonly string[]).includes(endpoint))
    throw new Error(`Unsupported fal endpoint: ${endpoint}`);
  // 不使用 SDK 的提交重试：超时可能已产生计费任务，不能盲目重发。
  const path = webhookUrl
    ? `${endpoint}?fal_webhook=${encodeURIComponent(mediaUrl.parse(webhookUrl))}`
    : endpoint;
  const attempts: FalUnsentSubmission['attempts'] = [];
  let response: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await requestFal(path, input);
      break;
    } catch (reason) {
      const codes = unsentConnectionCodes(reason);
      if (!codes) throw reason;
      attempts.push({
        codes: codes as FalUnsentSubmission['attempts'][number]['codes'],
        observedAt: new Date().toISOString(),
      });
      if (attempt === 2)
        throw new FalSubmissionNotSentError({
          endpoint, source: 'transport-before-send', attempts,
        });
    }
  }
  const parsed = falSubmission.safeParse(response);
  if (!parsed.success)
    throw new Error(
      'Generation service returned an invalid submission identity.'
    );
  return parsed.data.request_id;
}

export async function readFalQueueStatus(endpoint: FalEndpoint, requestId: string) {
  const root = falQueuePath(endpoint, requestId);
  const parsed = falQueueStatus.safeParse(await requestFal(`${root}/status`));
  if (!parsed.success || parsed.data.request_id !== requestId)
    throw new Error(
      'Generation service returned a different or invalid task identity.'
    );
  return parsed.data;
}

export async function readFalTask(endpoint: FalEndpoint, requestId: string) {
  const status = await readFalQueueStatus(endpoint, requestId);
  if (status.status !== 'COMPLETED') return { ready: false as const };
  if (status.error?.trim() || status.error_type?.trim())
    throw new FalTaskFailedError({
      endpoint,
      requestId,
      source: 'queue-status',
      status: 'COMPLETED',
      error: status.error,
      errorType: status.error_type,
    });
  // HTTP 错误不等于任务失败；只有最终任务失败字段允许走API失败退积分分支。
  return { ready: true as const, output: await requestFal(falQueuePath(endpoint, requestId)) };
}

export async function uploadFalTestFile(
  body: Buffer,
  filename: string,
  type: string
) {
  const client = createFalClient({
    credentials: falKey(),
    retry: { maxRetries: 0 },
    fetch: (url, init) =>
      fetch(url, {
        ...init,
        signal: AbortSignal.timeout(60_000),
        redirect: 'error',
      }),
  });
  const file = new File([new Uint8Array(body)], filename, { type });
  return mediaUrl.parse(await client.storage.upload(file));
}
