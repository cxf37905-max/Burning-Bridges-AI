import { getStudioAvailability } from '@/studio/availability';

export function GET() {
  const { emailReady, googleReady } = getStudioAvailability();
  // 只返回登录方式开关，不读取会话、用户或积分。
  return Response.json(
    { email: emailReady, google: googleReady },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
