import { photoDimensionsError, photoFileError } from './photo-validation';

// 为 multipart 字段留出余量，避免触发 Vercel 的 4.5 MB 请求体限制。
export const MAX_PHOTO_UPLOAD_BYTES = 4 * 1024 * 1024;

function encodePhoto(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((photo) => {
      if (photo) resolve(photo);
      else reject(new Error('Could not prepare this photo. Choose another file.'));
    }, 'image/jpeg', quality);
  });
}

export async function preparePhotoUpload(file: File) {
  const fileError = photoFileError(file);
  if (fileError) throw new Error(fileError);
  const bitmap = await createImageBitmap(file);
  try {
    const dimensionError = photoDimensionsError(bitmap.width, bitmap.height);
    if (dimensionError) throw new Error(dimensionError);
    if (file.size <= MAX_PHOTO_UPLOAD_BYTES)
      return { file, width: bitmap.width, height: bitmap.height };
    const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(bitmap.width * scale);
    canvas.height = Math.ceil(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare this photo. Try another browser.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.8, 0.7]) {
      const photo = await encodePhoto(canvas, quality);
      if (photo.size <= MAX_PHOTO_UPLOAD_BYTES)
        return {
          file: new File([photo], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
            type: 'image/jpeg',
            lastModified: file.lastModified,
          }),
          width: canvas.width,
          height: canvas.height,
        };
    }
    throw new Error('This photo is still too large to upload. Choose a smaller file.');
  } finally {
    bitmap.close();
  }
}
