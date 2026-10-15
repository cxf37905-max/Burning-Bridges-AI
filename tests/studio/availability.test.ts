import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/website', () => ({
  websiteConfig: {
    payment: { provider: 'dodo' },
    credits: {
      packages: {
        basic: { price: { priceId: 'test-product-basic' } },
        standard: { price: { priceId: 'test-product-standard' } },
      },
    },
  },
}));

import { getStudioAvailability } from '../../src/studio/availability';

beforeEach(() => {
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-auth-only');
  vi.stubEnv('DATABASE_URL', 'test-database-only');
  vi.stubEnv('DODO_PAYMENTS_API_KEY', 'test-api-only');
  vi.stubEnv('DODO_PAYMENTS_WEBHOOK_KEY', 'test-webhook-only');
  vi.stubEnv('DODO_DEBUG', 'false');
  vi.stubEnv('STUDIO_PAYMENTS_READY', 'false');
  vi.stubEnv('STUDIO_LAUNCH_READY', 'false');
  vi.stubEnv('AUTH_SECRET', '');
  vi.stubEnv('FAL_KEY', '');
});

afterEach(() => vi.unstubAllEnvs());

describe('正式积分购买与模型生成独立开放', () => {
  it('开放正式支付不要求配置或开启付费模型', () => {
    vi.stubEnv('STUDIO_PAYMENTS_READY', 'true');
    expect(getStudioAvailability()).toMatchObject({
      purchasesReady: true,
      generationReady: false,
    });
  });

  it('支付开关未开启时，即使模型已经就绪也不能购买', () => {
    vi.stubEnv('STUDIO_LAUNCH_READY', 'true');
    vi.stubEnv('FAL_KEY', 'test-model-only');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://example.com');
    vi.stubEnv('FAL_WEBHOOK_BASE_URL', 'https://example.com');
    vi.stubEnv('CRON_SECRET', 'test-callback-only-32-characters-long');
    vi.stubEnv('STUDIO_KLING_TIER', 'standard');
    vi.stubEnv('STORAGE_ENDPOINT', 'https://storage.example.com');
    vi.stubEnv('STORAGE_BUCKET_NAME', 'test-bucket');
    vi.stubEnv('STORAGE_ACCESS_KEY_ID', 'test-storage-id');
    vi.stubEnv('STORAGE_SECRET_ACCESS_KEY', 'test-storage-only');
    expect(getStudioAvailability()).toMatchObject({
      purchasesReady: false,
      generationReady: true,
    });
  });

  it.each(['DODO_PAYMENTS_API_KEY', 'DODO_PAYMENTS_WEBHOOK_KEY', 'DATABASE_URL'])(
    '缺少 %s 时支付开关不能绕过必要配置',
    (name) => {
      vi.stubEnv('STUDIO_PAYMENTS_READY', 'true');
      vi.stubEnv(name, '');
      expect(getStudioAvailability().purchasesReady).toBe(false);
    }
  );

  it('保留测试环境单独验证支付的能力', () => {
    vi.stubEnv('DODO_DEBUG', 'true');
    expect(getStudioAvailability()).toMatchObject({
      purchasesReady: true,
      generationReady: false,
    });
  });
});
