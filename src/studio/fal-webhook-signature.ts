import 'server-only';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';

const jwksSchema = z.object({
  keys: z.array(z.object({
    kty: z.literal('OKP'),
    crv: z.literal('Ed25519'),
    // fal 公钥可能带末尾补位符；解码后统一为 Node JWK 使用的无补位格式。
    x: z.string()
      .regex(/^[A-Za-z0-9_-]{43}=?$/)
      .transform((encoded) => Buffer.from(encoded, 'base64url'))
      .refine((bytes) => bytes.length === 32, 'ED25519 公钥必须为32字节。')
      .transform((bytes) => bytes.toString('base64url')),
  })).min(1),
});
let cachedKeys: { expiresAt: number; keys: z.infer<typeof jwksSchema>['keys'] } | undefined;

async function webhookPublicKeys(refresh = false) {
  if (!refresh && cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys;
  const response = await fetch('https://rest.fal.ai/.well-known/jwks.json', {
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Fal webhook public keys returned HTTP ${response.status}.`);
  const { keys } = jwksSchema.parse(await response.json());
  cachedKeys = { keys, expiresAt: Date.now() + 60 * 60_000 };
  return keys;
}

export async function verifyFalWebhookSignature(headers: Headers, body: Buffer) {
  const requestId = headers.get('x-fal-webhook-request-id');
  const userId = headers.get('x-fal-webhook-user-id');
  const timestamp = headers.get('x-fal-webhook-timestamp');
  const signature = headers.get('x-fal-webhook-signature');
  if (
    !requestId || !userId || !timestamp || !signature ||
    !/^\d{10}$/.test(timestamp) || !/^[a-fA-F0-9]{128}$/.test(signature) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  ) return false;
  const message = Buffer.from([
    requestId, userId, timestamp, createHash('sha256').update(body).digest('hex'),
  ].join('\n'));
  const matches = (keys: z.infer<typeof jwksSchema>['keys']) => keys.some((key) =>
    verify(null, message, createPublicKey({ key, format: 'jwk' }), Buffer.from(signature, 'hex'))
  );
  const hadCache = cachedKeys !== undefined;
  if (matches(await webhookPublicKeys())) return true;
  // 密钥轮换时刷新一次，不把过期缓存永久当作验签失败。
  return hadCache ? matches(await webhookPublicKeys(true)) : false;
}
