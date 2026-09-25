import { handleWebhookEvent } from '@/payment';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Stripe webhook handler
 * This endpoint receives webhook events from Stripe and processes them
 *
 * @param req The incoming request
 * @returns NextResponse
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Get the request body as text
  const payload = await req.text();

  // Get the Stripe signature from headers
  const signature = req.headers.get('stripe-signature') || '';

  try {
    // Validate inputs
    if (!payload || !signature) {
      console.warn('Stripe webhook: missing payload or signature');
      return NextResponse.json(
        { error: 'Missing payload or signature' },
        { status: 400 }
      );
    }

    // Process the webhook event
    await handleWebhookEvent(payload, signature, 'stripe');

    // Return success
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Error in webhook route:', error);

    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
