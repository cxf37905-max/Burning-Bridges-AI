import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PHOTO_UPLOAD_BYTES, preparePhotoUpload } from '../../src/studio/photo-upload';

afterEach(() => vi.unstubAllGlobals());

describe('照片上传请求大小', () => {
  it('小照片保留原文件，草稿恢复不会改变同一请求的照片身份', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 800, height: 1000, close,
    })));
    const photo = new File(['photo'], 'subject.jpg', { type: 'image/jpeg' });
    expect((await preparePhotoUpload(photo)).file).toBe(photo);
    expect(close).toHaveBeenCalledOnce();
  });
  it('超过平台限制的照片压缩后再上传，multipart 总大小留有余量', async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 4000, height: 5000, close,
    })));
    vi.stubGlobal('document', { createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ fillRect: vi.fn(), drawImage, fillStyle: '' }),
      toBlob: (ready: (photo: Blob) => void) => ready(new Blob(['compressed'], {
        type: 'image/jpeg',
      })),
    }) });
    const original = new File([new Uint8Array(5 * 1024 * 1024)], 'subject.png', {
      type: 'image/png',
    });
    const { file: uploaded } = await preparePhotoUpload(original);
    expect(uploaded.size).toBeLessThanOrEqual(MAX_PHOTO_UPLOAD_BYTES);
    expect(uploaded.type).toBe('image/jpeg');
    expect(drawImage).toHaveBeenCalled();
    const form = new FormData();
    form.set('photo', uploaded);
    form.set('requestId', '7b987ca5-ce09-431b-a832-e2a4a04f78b1');
    form.set('sceneId', 'chandelier');
    form.set('consent', 'true');
    expect((await new Response(form).arrayBuffer()).byteLength)
      .toBeLessThan(4.5 * 1000 * 1000);
    expect(close).toHaveBeenCalledOnce();
  });
  it('压缩仍超限时在客户端拒绝，不上传原始大图', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 4000, height: 5000, close,
    })));
    const oversized = new Blob([new Uint8Array(MAX_PHOTO_UPLOAD_BYTES + 1)]);
    vi.stubGlobal('document', { createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' }),
      toBlob: (ready: (photo: Blob) => void) => ready(oversized),
    }) });
    await expect(preparePhotoUpload(new File([oversized], 'subject.png', {
      type: 'image/png',
    }))).rejects.toThrow('still too large');
    expect(close).toHaveBeenCalledOnce();
  });
});
