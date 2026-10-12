import { PaymentTypes, PlanIntervals } from '@/payment/types';
import type { PaymentConfig, WebsiteConfig } from '@/types';

const paymentPriceIds: Record<
  NonNullable<PaymentConfig['provider']>,
  Record<string, string>
> = {
  stripe: {
    proMonthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY ?? '',
    proYearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY ?? '',
    lifetime: process.env.NEXT_PUBLIC_STRIPE_PRICE_LIFETIME ?? '',
    creditsBasic: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_BASIC ?? '',
    creditsStandard:
      process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_STANDARD ?? '',
    creditsPremium: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_PREMIUM ?? '',
    creditsEnterprise:
      process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_ENTERPRISE ?? '',
  },
  creem: {
    proMonthly: process.env.NEXT_PUBLIC_CREEM_PRODUCT_PRO_MONTHLY ?? '',
    proYearly: process.env.NEXT_PUBLIC_CREEM_PRODUCT_PRO_YEARLY ?? '',
    lifetime: process.env.NEXT_PUBLIC_CREEM_PRODUCT_LIFETIME ?? '',
    creditsBasic: process.env.NEXT_PUBLIC_CREEM_PRODUCT_CREDITS_BASIC ?? '',
    creditsStandard:
      process.env.NEXT_PUBLIC_CREEM_PRODUCT_CREDITS_STANDARD ?? '',
    creditsPremium: process.env.NEXT_PUBLIC_CREEM_PRODUCT_CREDITS_PREMIUM ?? '',
    creditsEnterprise:
      process.env.NEXT_PUBLIC_CREEM_PRODUCT_CREDITS_ENTERPRISE ?? '',
  },
  paypal: {
    proMonthly: process.env.NEXT_PUBLIC_PAYPAL_PLAN_PRO_MONTHLY ?? '',
    proYearly: process.env.NEXT_PUBLIC_PAYPAL_PLAN_PRO_YEARLY ?? '',
    lifetime:
      process.env.NEXT_PUBLIC_PAYPAL_PRICE_LIFETIME ?? 'paypal_lifetime',
    creditsBasic:
      process.env.NEXT_PUBLIC_PAYPAL_PRICE_CREDITS_BASIC ??
      'paypal_credits_basic',
    creditsStandard:
      process.env.NEXT_PUBLIC_PAYPAL_PRICE_CREDITS_STANDARD ??
      'paypal_credits_standard',
    creditsPremium:
      process.env.NEXT_PUBLIC_PAYPAL_PRICE_CREDITS_PREMIUM ??
      'paypal_credits_premium',
    creditsEnterprise:
      process.env.NEXT_PUBLIC_PAYPAL_PRICE_CREDITS_ENTERPRISE ??
      'paypal_credits_enterprise',
  },
};

export function findPaymentPriceKey(priceId: string) {
  if (!priceId) return null;
  for (const [provider, prices] of Object.entries(paymentPriceIds)) {
    const key = Object.keys(prices).find((name) => prices[name] === priceId);
    if (key)
      return {
        provider: provider as NonNullable<PaymentConfig['provider']>,
        key,
      };
  }
  return null;
}

// 支付商由环境变量选择：stripe、creem 或 paypal
const paymentProvider = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER ||
  'stripe') as PaymentConfig['provider'];
const priceIds = paymentPriceIds[paymentProvider];
// 客服邮箱只改这一处，法律页面、联系入口和邮件收件人共用。
const legalSupportEmail = 'support@burningbridgesai.cc';

// 所有站点共用的生成内容使用规则，避免营销页和条款出现不同口径。
export const commercialUseTerms =
  'Subject to these terms and applicable law, users on a paid plan may use generated content for personal or commercial purposes. Users relying only on free access may use generated content solely for personal and other non-commercial purposes unless we expressly state otherwise.';

/**
 * website config, without translations
 *
 * docs:
 * https://mksaas.com/docs/config/website
 */
export const websiteConfig: WebsiteConfig = {
  // 新站上线前只需填写会随网站变化的公开信息。
  legal: {
    supportEmail: legalSupportEmail,
    // 政策真正发布或更新的日期。
    lastUpdated: '2026-09-24',
  },
  ui: {
    mode: {
      defaultMode: 'dark',
      enableSwitch: true,
    },
  },
  metadata: {
    images: {
      ogImage: '/og.png',
      logoLight: '/logo.png',
      logoDark: '/logo-dark.png',
    },
    social: {
      github: 'https://github.com/MkSaaSHQ',
      twitter: 'https://mksaas.link/twitter',
      blueSky: 'https://mksaas.link/bsky',
      discord: 'https://mksaas.link/discord',
      mastodon: 'https://mksaas.link/mastodon',
      linkedin: 'https://mksaas.link/linkedin',
      youtube: 'https://mksaas.link/youtube',
    },
  },
  features: {
    enableUpgradeCard: false,
    enableUpdateAvatar: true,
    enableDatafastRevenueTrack: false,
    enableCrispChat: false,
    enableTurnstileCaptcha: false,
  },
  affiliates: {
    enable: false,
    provider: 'affonso',
  },
  analytics: {
    enableVercelAnalytics: false,
    enableSpeedInsights: false,
  },
  apikeys: {
    enable: false,
  },
  auth: {
    enableGoogleLogin: true,
    enableGithubLogin: false,
    enableCredentialLogin: true,
    enableDeleteUser: false,
  },
  i18n: {
    defaultLocale: 'en',
    locales: {
      en: {
        flag: '🇺🇸',
        name: 'English',
        hreflang: 'en',
      },
    },
  },
  blog: {
    enable: true,
    paginationSize: 6,
    relatedPostsSize: 3,
  },
  docs: {
    enable: true,
  },
  mail: {
    enable: true,
    provider: 'resend',
    // 默认与客服邮箱共用一个地址；上线前在 Resend 验证发信域名。
    fromEmail: legalSupportEmail,
    supportEmail: legalSupportEmail,
  },
  newsletter: {
    enable: true,
    provider: 'resend',
    autoSubscribeAfterSignUp: false,
  },
  notification: {
    enable: true,
    provider: 'feishu',
  },
  storage: {
    enable: true,
    provider: 's3',
  },
  payment: {
    provider: paymentProvider,
  },
  price: {
    plans: {
      free: {
        id: 'free',
        prices: [],
        isFree: true,
        isLifetime: false,
        credits: {
          enable: false,
          amount: 0,
          expireDays: 30,
        },
      },
      pro: {
        id: 'pro',
        prices: [
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: priceIds.proMonthly,
            amount: 990,
            currency: 'USD',
            interval: PlanIntervals.MONTH,
          },
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: priceIds.proYearly,
            amount: 9900,
            currency: 'USD',
            interval: PlanIntervals.YEAR,
          },
        ],
        isFree: false,
        isLifetime: false,
        popular: true,
        credits: {
          enable: false,
          amount: 0,
          expireDays: 30,
        },
      },
      lifetime: {
        id: 'lifetime',
        prices: [
          {
            type: PaymentTypes.ONE_TIME,
            priceId: priceIds.lifetime,
            amount: 19900,
            currency: 'USD',
            allowPromotionCode: true,
          },
        ],
        isFree: false,
        isLifetime: true,
        credits: {
          enable: false,
          amount: 0,
          expireDays: 30,
        },
      },
    },
  },
  credits: {
    enableCredits: true,
    enablePackagesForFreePlan: false,
    registerGiftCredits: {
      enable: false,
      amount: 0,
      expireDays: 30,
    },
    packages: {
      basic: {
        id: 'basic',
        popular: false,
        amount: 100,
        expireDays: 30,
        price: {
          priceId: priceIds.creditsBasic,
          amount: 990,
          currency: 'USD',
          allowPromotionCode: true,
        },
      },
      standard: {
        id: 'standard',
        popular: true,
        amount: 200,
        expireDays: 30,
        price: {
          priceId: priceIds.creditsStandard,
          amount: 1490,
          currency: 'USD',
          allowPromotionCode: true,
        },
      },
      premium: {
        id: 'premium',
        popular: false,
        amount: 500,
        expireDays: 30,
        price: {
          priceId: priceIds.creditsPremium,
          amount: 3990,
          currency: 'USD',
          allowPromotionCode: true,
        },
      },
      enterprise: {
        id: 'enterprise',
        popular: false,
        amount: 1000,
        expireDays: 30,
        price: {
          priceId: priceIds.creditsEnterprise,
          amount: 6990,
          currency: 'USD',
          allowPromotionCode: true,
        },
      },
    },
  },
};
