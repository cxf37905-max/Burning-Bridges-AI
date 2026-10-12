import { describe, expect, it } from 'vitest';
import {
  MAX_PHOTO_BYTES,
  photoDimensionsError,
  photoFileError,
} from '../../src/studio/photo-validation';

describe('照片边界校验', () => {
  it('拒绝伪装为照片的非允许类型及空文件', () => {
    expect(photoFileError({ type: 'text/html', size: 100 })).toContain('JPG');
    expect(photoFileError({ type: 'image/jpeg', size: 0 })).toContain('empty');
  });
  it('允许最大边界，拒绝超限', () => {
    expect(
      photoFileError({ type: 'image/webp', size: MAX_PHOTO_BYTES })
    ).toBeNull();
    expect(
      photoFileError({ type: 'image/png', size: MAX_PHOTO_BYTES + 1 })
    ).toContain('20 MB');
  });
  it('拒绝窄图、无效尺寸，允许最小合法照片', () => {
    expect(photoDimensionsError(600, 340)).toContain('341');
    expect(photoDimensionsError(Number.NaN, 1000)).toContain('341');
    expect(photoDimensionsError(341, 341)).toBeNull();
    expect(photoDimensionsError(1000, 400)).toBeNull();
    expect(photoDimensionsError(400, 1000)).toBeNull();
    expect(photoDimensionsError(1001, 400)).toContain('crop');
    expect(photoDimensionsError(400, 1001)).toContain('crop');
  });
});
