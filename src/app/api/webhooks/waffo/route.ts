import { handleWebhookEvent } from '@/payment';
import { type NextRequest, NextResponse } from 'next/server';

// 在 Waffo 商店后台注册 /api/webhooks/waffo，分别配置测试和生产环境。
export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload = await req.text();
  const signature = req.headers.get('x-waffo-signature') ?? '';
  if (!payload || !signature) {
    return NextResponse.json(
      { error: '缺少 Waffo Webhook 内容或签名' },
      { status: 400 }
    );
  }
  try {
    await handleWebhookEvent(payload, signature, 'waffo', req.headers);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Waffo Webhook 处理失败：', error);
    return NextResponse.json(
      { error: 'Waffo Webhook 处理失败' },
      { status: 500 }
    );
  }
}
