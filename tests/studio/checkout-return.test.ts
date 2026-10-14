import { describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/studio/checkout/return/route';

vi.mock('@/lib/urls', () => ({ getBaseUrl: () => 'http://localhost:3000' }));

describe('支付商中转返回', () => {
  it('保留订单同步标识并固定返回本站首页', () => {
    const syncId = '0123456789abcdef0123456789abcdef';
    const response = GET(
      new Request(
        `https://tunnel.example/api/studio/checkout/return?syncId=${syncId}&redirect=https://other.example`
      )
    );
    const location = new URL(response.headers.get('location')!);
    expect(response.status).toBe(303);
    expect(location.origin).toBe('http://localhost:3000');
    expect(location.pathname).toBe('/');
    expect(location.hash).toBe('#studio');
    expect(location.searchParams.get('checkout')).toBe('returned');
    expect(location.searchParams.get('syncId')).toBe(syncId);
    expect(location.searchParams.has('redirect')).toBe(false);
  });

  it('不透传非本站格式的同步标识', () => {
    const response = GET(
      new Request(
        'https://tunnel.example/api/studio/checkout/return?syncId=invalid'
      )
    );
    expect(
      new URL(response.headers.get('location')!).searchParams.has('syncId')
    ).toBe(false);
  });
});
