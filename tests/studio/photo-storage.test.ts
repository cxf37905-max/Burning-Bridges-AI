import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { normalizeStudioPhoto } from '../../src/studio/photo-storage';

describe('服务端照片校验', () => {
  it('识别文件内容，拒绝伪装成 JPEG 的损坏文件', async () => {
    await expect(
      normalizeStudioPhoto(
        new File(['not an image'], 'portrait.jpg', { type: 'image/jpeg' })
      )
    ).rejects.toThrow('could not be decoded');
  });
  it('在服务端拒绝过小尺寸和极端比例', async () => {
    for (const [width, height] of [
      [340, 600],
      [1600, 512],
    ]) {
      const bytes = await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 30, g: 40, b: 30 },
        },
      })
        .png()
        .toBuffer();
      await expect(
        normalizeStudioPhoto(
          new File([new Uint8Array(bytes)], 'portrait.png', {
            type: 'image/png',
          })
        )
      ).rejects.toThrow();
    }
  });
  it('规范为 JPEG，移除 EXIF 并限制上传给服务商的像素尺寸', async () => {
    const bytes = await sharp({
      create: {
        width: 2400,
        height: 1600,
        channels: 3,
        background: { r: 30, g: 40, b: 30 },
      },
    })
      .withExif({ IFD0: { Artist: 'test-only metadata' } })
      .png()
      .toBuffer();
    const result = await normalizeStudioPhoto(
      new File([new Uint8Array(bytes)], 'portrait.png', { type: 'image/png' })
    );
    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(1536);
    expect(metadata.exif).toBeUndefined();
  });
});
