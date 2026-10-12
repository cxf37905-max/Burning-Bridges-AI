import { describe, expect, it } from 'vitest';
import { authCallbackUrl, authRedirect } from '../../src/lib/auth-redirect';

describe('认证回跳地址', () => {
  it('保留站内路径、查询参数和锚点，并使用当前站点的完整地址', () => {
    expect(authCallbackUrl('/#studio', 'http://localhost:3000')).toBe(
      'http://localhost:3000/#studio'
    );
    expect(
      authCallbackUrl(
        '/library?view=recent#videos',
        'https://burningbridgesai.cc'
      )
    ).toBe('https://burningbridgesai.cc/library?view=recent#videos');
  });

  it.each([
    'https://untrusted.example',
    '//untrusted.example',
    '/\\untrusted.example',
    '/\n/untrusted.example',
    '/\t/untrusted.example',
  ])('不允许危险回跳地址：%j', (destination) => {
    expect(authRedirect(destination)).toBe('/#studio');
    expect(authCallbackUrl(destination, 'http://localhost:3000')).toBe(
      'http://localhost:3000/#studio'
    );
  });
});
