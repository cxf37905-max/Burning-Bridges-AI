import 'server-only';
import { S3Client } from '@aws-sdk/client-s3';

function storageSetting(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function createR2Storage() {
  const endpoint = new URL(storageSetting('STORAGE_ENDPOINT'));
  if (
    endpoint.protocol !== 'https:' ||
    !endpoint.hostname.endsWith('.r2.cloudflarestorage.com')
  )
    throw new Error('STORAGE_ENDPOINT must be a Cloudflare R2 HTTPS endpoint.');
  const bucket = storageSetting('STORAGE_BUCKET_NAME');
  const client = new S3Client({
    region: 'auto',
    endpoint: endpoint.origin,
    maxAttempts: 2,
    requestHandler: { requestTimeout: 10_000, connectionTimeout: 5_000 },
    credentials: {
      accessKeyId: storageSetting('STORAGE_ACCESS_KEY_ID'),
      secretAccessKey: storageSetting('STORAGE_SECRET_ACCESS_KEY'),
    },
  });
  return { client, bucket };
}
