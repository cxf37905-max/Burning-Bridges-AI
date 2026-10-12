export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const MIN_PHOTO_EDGE = 341;
const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];

export function photoFileError(file: { type: string; size: number }) {
  if (!acceptedTypes.includes(file.type))
    return 'Choose a JPG, PNG or WebP photo.';
  if (file.size === 0) return 'This file is empty. Choose another photo.';
  if (file.size > MAX_PHOTO_BYTES)
    return 'This photo is larger than 20 MB. Choose a smaller file.';
  return null;
}

export function photoDimensionsError(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    Math.min(width, height) < MIN_PHOTO_EDGE
  ) {
    return 'Your photo needs to be at least 341 pixels on each side.';
  }
  const ratio = width / height;
  if (ratio < 0.4 || ratio > 2.5)
    return 'Choose a portrait or square photo with a less extreme crop.';
  return null;
}
