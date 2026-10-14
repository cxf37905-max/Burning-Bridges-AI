import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);
export const config = {
  matcher: [
    '/((?!_next|_vercel|.*\\..*).*)',
    // 文档路径中的点号不能绕过项目页面白名单。
    '/docs/:path*',
    '/:locale/docs/:path*',
    '/docs.mdx',
    '/:locale/docs.mdx',
  ],
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
  // 各支付商的独立回调保留验签入口，切换后仍可处理旧订单迟到事件。
  if (pathname.startsWith('/api/')) {
    if (
      pathname.startsWith('/api/studio/') ||
      pathname.startsWith('/api/auth/') ||
      /^\/api\/webhooks\/(stripe|creem|paypal|waffo|dodo)$/.test(pathname) ||
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
  if (!publicPages.has(pagePath))
    return new NextResponse('Page not found.', {
      status: 404,
      headers: { 'X-Robots-Tag': 'noindex' },
    });
  // 页面、Server Action 与 Route Handler 使用同一服务端 Session 鉴权。
  return intlMiddleware(request);
}
