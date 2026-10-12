import { websiteConfig } from '@/config/website';
import { getDb } from '@/db';
import { LOCALE_COOKIE_NAME, routing } from '@/i18n/routing';
import { sendEmail } from '@/mail';
import { betterAuth } from 'better-auth';
import { emailHarmony } from 'better-auth-harmony';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, apiKey } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { parse as parseCookies } from 'cookie';
import type { Locale } from 'next-intl';
import { getBaseUrl, getUrlWithLocaleInCallbackUrl } from './urls';

const googleClientId =
  process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID;
const googleClientSecret =
  process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET;

// 复用模板认证与用户表；注册、邮箱登录及 OAuth 登录均不创建积分。
export const auth = betterAuth({
  baseURL: getBaseUrl(),
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
  appName: 'Burning Bridges AI',
  database: drizzleAdapter(await getDb(), { provider: 'pg' }),
  session: {
    cookieCache: { enabled: true, maxAge: 60 },
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    freshAge: 0,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
    minPasswordLength: 8,
    async sendResetPassword({ user, url }, request) {
      const locale = getLocaleFromRequest(request);
      const result = await sendEmail({
        to: user.email,
        template: 'forgotPassword',
        context: {
          url: getUrlWithLocaleInCallbackUrl(url, locale),
          name: user.name,
        },
        locale,
      });
      if (!result.success)
        throw new Error('Password reset email could not be sent.');
    },
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {},
  // 未验证的邮箱账号不自动合并到 Google 账号，防止共享登录凭据。
  account: { accountLinking: { enabled: false } },
  user: {
    additionalFields: { customerId: { type: 'string', required: false } },
    deleteUser: { enabled: websiteConfig.auth.enableDeleteUser ?? false },
  },
  plugins: [
    admin({
      defaultBanExpiresIn: undefined,
      bannedUserMessage: 'Your account is suspended. Please contact support.',
    }),
    apiKey(),
    emailHarmony({ allowNormalizedSignin: false }),
    nextCookies(),
  ],
  onAPIError: { errorURL: '/auth/error' },
});

export function getLocaleFromRequest(request?: Request): Locale {
  const cookies = parseCookies(request?.headers.get('cookie') ?? '');
  return (cookies[LOCALE_COOKIE_NAME] as Locale) ?? routing.defaultLocale;
}
