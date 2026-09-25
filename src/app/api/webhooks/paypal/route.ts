import { handleWebhookEvent } from '@/payment';
import { type NextRequest, NextResponse } from 'next/server';

// 在 PayPal 控制台注册 /api/webhooks/paypal，并订阅订单、扣款及订阅事件。
export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload = await req.text();
  const signature = req.headers.get('paypal-transmission-sig') ?? '';
  if (!payload || !signature) {
    return NextResponse.json(
      { error: '缺少 PayPal Webhook 内容或签名' },
      { status: 400 }
    );
  }
  try {
    await handleWebhookEvent(payload, signature, 'paypal', req.headers);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('PayPal Webhook 处理失败：', error);
    return NextResponse.json(
      { error: 'PayPal Webhook 处理失败' },
      { status: 500 }
    );
  }
}
