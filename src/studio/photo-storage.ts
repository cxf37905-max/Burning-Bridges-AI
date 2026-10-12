import 'server-only';
import sharp from 'sharp';
import { storeR2Object } from './r2-storage';
import { photoFileError, photoDimensionsError } from './photo-validation';
import { photoRetentionSeconds } from './media-retention';

export class InvalidPhotoError extends Error {}

export async function normalizeStudioPhoto(file: File) {
  const fileError = photoFileError(file);
  if (fileError) throw new InvalidPhotoError(fileError);
  const picture = sharp(Buffer.from(await file.arrayBuffer()), {
    limitInputPixels: 50_000_000,
  });
  const metadata = await picture.metadata().catch(() => {
    throw new InvalidPhotoError(
      'This photo could not be decoded. Choose another JPG, PNG, or WebP.'
    );
  });
  if (
    !metadata.width ||
    !metadata.height ||
    !['jpeg', 'png', 'webp'].includes(metadata.format || '')
  )
    throw new InvalidPhotoError('Choose a valid JPG, PNG, or WebP photo.');
  const dimensionError = photoDimensionsError(metadata.width, metadata.height);
  if (dimensionError) throw new InvalidPhotoError(dimensionError);
  return picture
    .rotate()
    .resize({
      width: 1536,
      height: 1536,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function storeStudioPhoto(jobId: string, picture: Buffer) {
  // 只允许服务商通过限时签名读取；R2 桶不需要公开。
  return storeR2Object(
    `studio-inputs/${jobId}.jpg`,
    picture,
    'image/jpeg',
    photoRetentionSeconds
  );
}
