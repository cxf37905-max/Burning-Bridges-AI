import { handleWebhookEvent } from '@/payment';
import { type NextRequest, NextResponse } from 'next/server';

// 在 Dodo 后台订阅 payment.*、subscription.*、refund.*，测试与生产分别配置。
export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload = await req.text();
  const signature = req.headers.get('webhook-signature') ?? '';
  if (
    !payload ||
    !signature ||
    !req.headers.get('webhook-id') ||
    !req.headers.get('webhook-timestamp')
  ) {
    return NextResponse.json(
      { error: '缺少 Dodo Webhook 内容或签名头' },
      { status: 400 }
    );
  }
  try {
    await handleWebhookEvent(payload, signature, 'dodo', req.headers);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Dodo Webhook 处理失败：', error);
    return NextResponse.json(
      { error: 'Dodo Webhook 处理失败' },
      { status: 500 }
    );
  }
}
