import { getWaffoClient } from '@/studio/waffo';
import { fulfillVideoPayment } from '@/studio/fulfill-payment';

export async function POST(request: Request) {
  const signature = request.headers.get('x-signature');
  if (!signature) return Response.json({ message: 'failed' }, { status: 400 });
  const rawBody = await request.text();
  const result = await getWaffoClient()
    .webhook()
    .onPayment(fulfillVideoPayment)
    .handleWebhook(rawBody, signature);
  return new Response(result.responseBody, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-SIGNATURE': result.responseSignature,
      'Cache-Control': 'no-store',
    },
  });
}
