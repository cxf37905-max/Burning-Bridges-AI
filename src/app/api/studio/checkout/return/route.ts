import { getBaseUrl } from '@/lib/urls';

export function GET() {
  // 固定返回本站，不读取付款状态、不发积分，也不接受外部传入的跳转目标。
  return Response.redirect(
    new URL('/?checkout=returned#studio', getBaseUrl()),
    303
  );
}
