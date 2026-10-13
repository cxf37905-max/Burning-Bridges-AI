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
  const paymentReady = Boolean(
    websiteConfig.payment.provider === 'waffo' &&
      process.env.WAFFO_PRIVATE_KEY &&
      process.env.WAFFO_MERCHANT_ID &&
      process.env.WAFFO_STORE_ID &&
      [undefined, 'true', 'false'].includes(process.env.WAFFO_DEBUG) &&
      Object.values(websiteConfig.credits.packages).every(
        (pack) => pack.price.priceId
      )
  );
  // 上线开关用于在真实样片、计费和政策完成验证后开放付费服务。
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
  return {
    authReady,
    emailReady,
    passwordResetReady,
    googleReady,
    generationReady,
    purchasesReady: authReady && paymentReady && generationReady,
  };
}
