import 'server-only';
import { websiteConfig } from '@/config/website';
import { falWebhookOrigin } from './fal-webhook-url';

export function getStudioAvailability() {
  const authReady = Boolean(
    (process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET) &&
      process.env.DATABASE_URL
  );
  const emailReady = authReady;
  const passwordResetReady = authReady && Boolean(process.env.RESEND_API_KEY);
  const googleReady =
    authReady &&
    Boolean(
      (process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID) &&
        (process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET)
    );
  const paymentCredentials = {
    stripe: process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
    creem: process.env.CREEM_API_KEY && process.env.CREEM_WEBHOOK_SECRET,
    paypal: process.env.PAYPAL_CLIENT_ID &&
      process.env.PAYPAL_CLIENT_SECRET &&
      process.env.PAYPAL_WEBHOOK_ID,
    waffo: process.env.WAFFO_PRIVATE_KEY &&
      process.env.WAFFO_MERCHANT_ID &&
      process.env.WAFFO_STORE_ID &&
      [undefined, 'true', 'false'].includes(process.env.WAFFO_DEBUG),
    dodo: process.env.DODO_PAYMENTS_API_KEY &&
      process.env.DODO_PAYMENTS_WEBHOOK_KEY &&
      [undefined, 'true', 'false'].includes(process.env.DODO_DEBUG),
  };
  const productIds = Object.values(websiteConfig.credits.packages).map(
    (pack) => pack.price.priceId
  );
  const paymentReady = Boolean(
    paymentCredentials[websiteConfig.payment.provider] &&
      productIds.length > 0 && productIds.every(Boolean) &&
      new Set(productIds).size === productIds.length
  );
  // 视频生成与积分购买分别开放，配置支付不能顺带开启付费模型调用。
  const generationReady =
    authReady &&
    process.env.STUDIO_LAUNCH_READY === 'true' &&
    Boolean(
      process.env.FAL_KEY &&
        falWebhookOrigin() &&
        process.env.CRON_SECRET &&
        process.env.CRON_SECRET.length >= 32 &&
        ['standard', 'pro'].includes(
          process.env.STUDIO_KLING_TIER || 'standard'
        ) &&
        process.env.STORAGE_ENDPOINT &&
        process.env.STORAGE_BUCKET_NAME &&
        process.env.STORAGE_ACCESS_KEY_ID &&
        process.env.STORAGE_SECRET_ACCESS_KEY
    );
  const sandboxPayment =
    (websiteConfig.payment.provider === 'waffo' && process.env.WAFFO_DEBUG === 'true') ||
    (websiteConfig.payment.provider === 'dodo' && process.env.DODO_DEBUG === 'true');
  return {
    authReady,
    emailReady,
    passwordResetReady,
    googleReady,
    generationReady,
    purchasesReady:
      authReady && paymentReady &&
      (process.env.STUDIO_PAYMENTS_READY === 'true' || sandboxPayment),
  };
}
