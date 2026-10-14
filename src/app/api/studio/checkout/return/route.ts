import { getBaseUrl } from '@/lib/urls';

export function GET(request: Request) {
  // 固定返回本站，不读取付款状态、不发积分，也不接受外部传入的跳转目标。
  const returnUrl = new URL('/?checkout=returned#studio', getBaseUrl());
  const syncId = new URL(request.url).searchParams.get('syncId');
  // 只透传本站生成的同步标识，最终归属由服务端 Session 校验。
  if (syncId && /^[a-f0-9]{32}$/.test(syncId))
    returnUrl.searchParams.set('syncId', syncId);
  return Response.redirect(returnUrl, 303);
}
