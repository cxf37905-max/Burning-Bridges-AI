import 'server-only';
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createR2Storage } from './r2-client';
import {
  photoRetentionSeconds,
  videoRetentionSeconds,
} from './media-retention';

export async function deleteExpiredStudioMedia(now = new Date()) {
  const { client, bucket } = createR2Storage();
  const totals = { examined: 0, deleted: 0 };
  try {
    for (const [prefix, seconds] of [
      ['studio-inputs/', photoRetentionSeconds],
      ['studio-results/', videoRetentionSeconds],
    ] as const) {
      let continuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            MaxKeys: 1000,
            ContinuationToken: continuationToken,
          })
        );
        const expired: { Key: string }[] = [];
        for (const object of page.Contents ?? []) {
          if (
            !object.Key?.startsWith(prefix) ||
            !object.LastModified ||
            !Number.isFinite(object.LastModified.getTime())
          )
            throw new Error(`Invalid R2 retention object in prefix: ${prefix}`);
          totals.examined++;
          if (now.getTime() - object.LastModified.getTime() >= seconds * 1000)
            expired.push({ Key: object.Key });
        }
        if (expired.length) {
          const result = await client.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: expired, Quiet: false },
            })
          );
          if (result.Errors?.length)
            throw new Error(
              `R2 retention deletion failed: ${result.Errors.map((error) => `${error.Key}: ${error.Code}`).join(', ')}`
            );
          if (result.Deleted?.length !== expired.length)
            throw new Error(
              `R2 retention deletion was not confirmed: ${prefix}`
            );
          totals.deleted += result.Deleted.length;
        }
        continuationToken = page.IsTruncated
          ? page.NextContinuationToken
          : undefined;
        if (page.IsTruncated && !continuationToken)
          throw new Error(
            `R2 retention page has no continuation token: ${prefix}`
          );
      } while (continuationToken);
    }
    return totals;
  } finally {
    client.destroy();
  }
}
