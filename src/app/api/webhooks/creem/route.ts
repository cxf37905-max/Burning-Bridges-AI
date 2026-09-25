import { handleWebhookEvent } from '@/payment';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Creem webhook handler
 *
 * Configure in Creem Dashboard: Settings -> Webhooks -> Add endpoint
 * Endpoint URL: https://your-domain.com/api/webhooks/creem
 * Events: checkout.completed, subscription.paid, subscription.active,
 *         subscription.update, subscription.canceled,
 *         subscription.scheduled_cancel, subscription.expired,
 *         subscription.trialing, subscription.past_due, subscription.paused
 *
 * @param req The incoming request
 * @returns NextResponse
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Get the request body as text
  const payload = await req.text();

  // Get the Creem signature from headers
  const signature = req.headers.get('creem-signature') || '';

  try {
    // Validate inputs
    if (!payload || !signature) {
      console.warn('Creem webhook: missing payload or signature');
      return NextResponse.json(
        { error: 'Missing payload or signature' },
        { status: 400 }
      );
    }

    // Process the webhook event
    await handleWebhookEvent(payload, signature, 'creem');

    // Return success
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Error in Creem webhook route:', error);

    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
