import 'server-only';
import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createR2Storage } from './r2-client';
import { videoExpiresAt, videoHasExpired } from './media-retention';

export async function storeR2Object(
  key: string,
  body: Buffer,
  contentType: string,
  expiresIn: number
) {
  const { client, bucket } = createR2Storage();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'private, no-store',
      })
    );
    return await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn }
    );
  } finally {
    client.destroy();
  }
}

export class StoredVideoUnavailableError extends Error {}

export async function getStoredVideoUrl(jobId: string) {
  if (!/^[a-f0-9]{32}$/.test(jobId))
    throw new Error(`Invalid studio video ID: ${jobId}`);
  const { client, bucket } = createR2Storage();
  const key = `studio-results/${jobId}.mp4`;
  try {
    const object = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );
    if (!object.LastModified || !Number.isFinite(object.LastModified.getTime()))
      throw new Error(`R2 video has no LastModified: ${key}`);
    const now = new Date();
    const remaining = Math.floor(
      (videoExpiresAt(object.LastModified).getTime() - now.getTime()) / 1000
    );
    if (videoHasExpired(object.LastModified, now) || remaining < 1)
      throw new StoredVideoUnavailableError('This video has expired.');
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn: Math.min(300, remaining) }
    );
  } catch (reason) {
    if (
      reason instanceof S3ServiceException &&
      reason.$metadata.httpStatusCode === 404
    )
      throw new StoredVideoUnavailableError(
        'This video is no longer available.'
      );
    throw reason;
  } finally {
    client.destroy();
  }
}
