import { checkoutInput } from '@/studio/payment-validation';
import { getStudioUser } from '@/studio/auth';
import { getStudioAvailability } from '@/studio/availability';
import { createVideoCheckout } from '@/studio/checkout';
import { paymentProviderLabel } from '@/config/website';

export async function POST(request: Request) {
  const expectedOrigin = new URL(
    process.env.NEXT_PUBLIC_BASE_URL || 'https://burningbridgesai.cc'
  ).origin;
  if (request.headers.get('origin') !== expectedOrigin)
    return Response.json(
      { error: 'Request origin is not allowed.' },
      { status: 403 }
    );
  const user = await getStudioUser();
  if (!user)
    return Response.json(
      { error: 'Sign in before buying a video pack.' },
      { status: 401 }
    );
  if (!getStudioAvailability().purchasesReady)
    return Response.json(
      { error: 'Purchases open when video generation is ready.' },
      { status: 503 }
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch (reason) {
    if (!(reason instanceof SyntaxError)) throw reason;
    return Response.json(
      { error: 'Checkout request must contain valid JSON.' },
      { status: 400 }
    );
  }
  const input = checkoutInput.safeParse(body);
  if (!input.success)
    return Response.json(
      { error: 'Choose a valid video pack and checkout request ID.' },
      { status: 400 }
    );
  try {
    return Response.json(
      await createVideoCheckout(user, input.data.packId, input.data.requestId)
    );
  } catch (reason) {
    // 接口边界记录服务端原因并返回 JSON，不向浏览器泄露支付商或数据库细节。
    console.error(`创建 ${paymentProviderLabel} 收银台失败：`, reason);
    return Response.json(
      { error: 'Checkout could not start. Please try again.' },
      { status: 500 }
    );
  }
}
