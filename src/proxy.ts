import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);
export const config = {
  matcher: ['/((?!_next|_vercel|.*\\..*).*)'],
};
const publicPages = new Set([
  '/',
  '/pricing',
  '/privacy',
  '/terms',
  '/sign-in',
  '/library',
  '/dashboard',
  '/settings/credits',
  '/settings/billing',
  '/settings/profile',
  '/settings/security',
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/error',
]);

export default function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // 开放产品、认证和模板 Waffo 回调；其他支付商与示例 API 保持关闭。
  if (pathname.startsWith('/api/')) {
    if (
      pathname.startsWith('/api/studio/') ||
      pathname.startsWith('/api/auth/') ||
      pathname === '/api/webhooks/waffo' ||
      pathname === '/api/webhooks/fal' ||
      pathname === '/api/storage/upload'
    )
      return NextResponse.next();
    return NextResponse.json(
      { error: 'This endpoint is not available.' },
      { status: 404 }
    );
  }
  const pagePath = pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  if (!publicPages.has(pagePath) && !/^\/guides\/[a-z0-9-]+\/?$/.test(pagePath))
    return new NextResponse('Page not found.', { status: 404 });
  // 页面、Server Action 与 Route Handler 使用同一服务端 Session 鉴权。
  return intlMiddleware(request);
}
