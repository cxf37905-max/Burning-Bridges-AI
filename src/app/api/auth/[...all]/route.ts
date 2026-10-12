import { getStudioAvailability } from '@/studio/availability';

async function serveAuth(request: Request) {
  const { authReady, passwordResetReady, googleReady } =
    getStudioAvailability();
  const pathname = new URL(request.url).pathname;
  if (!authReady)
    return Response.json(
      {
        message: 'Sign-in is currently unavailable.',
        code: 'AUTH_UNAVAILABLE',
      },
      { status: 503 }
    );
  if (pathname.endsWith('/request-password-reset') && !passwordResetReady)
    return Response.json(
      {
        message: 'Password reset is currently unavailable.',
        code: 'AUTH_UNAVAILABLE',
      },
      { status: 503 }
    );
  if (pathname.endsWith('/sign-in/social') && !googleReady)
    return Response.json(
      {
        message: 'Google sign-in is not configured yet.',
        code: 'AUTH_UNAVAILABLE',
      },
      { status: 503 }
    );
  const { auth } = await import('@/lib/auth');
  return auth.handler(request);
}

export const GET = serveAuth;
export const POST = serveAuth;
