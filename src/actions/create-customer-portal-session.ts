'use server';

import { getDb } from '@/db';
import { payment, user } from '@/db/schema';
import { findPaymentPriceKey } from '@/config/website';
import { userActionClient } from '@/lib/safe-action';
import { getUrlWithLocale } from '@/lib/urls';
import { createCustomerPortal } from '@/payment';
import { type CreatePortalParams } from '@/payment/types';
import { and, desc, eq } from 'drizzle-orm';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';

// Portal schema for validation
const portalSchema = z.object({
  userId: z.string().min(1, { error: 'User ID is required' }),
  returnUrl: z.url({ error: 'Return URL must be a valid URL' }).optional(),
});

/**
 * Create a customer portal session
 */
export const createPortalAction = userActionClient
  .inputSchema(portalSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { returnUrl } = parsedInput;
    const currentUser = ctx.user;

    try {
      // Get the user's customer ID from the database
      const db = await getDb();
      const customerResult = await db
        .select({ customerId: user.customerId })
        .from(user)
        .where(eq(user.id, currentUser.id))
        .limit(1);

      const purchaseResult = await db
        .select({ customerId: payment.customerId, priceId: payment.priceId })
        .from(payment)
        .where(
          and(
            eq(payment.userId, currentUser.id),
            eq(payment.paid, true)
          )
        )
        .orderBy(desc(payment.createdAt))
        .limit(1);

      const purchase = purchaseResult[0];
      const purchaseProvider = purchase
        ? findPaymentPriceKey(purchase.priceId)?.provider
        : undefined;
      const customerId =
        purchase?.customerId || customerResult[0]?.customerId;

      if (!customerId) {
        console.error(`No customer found for user ${currentUser.id}`);
        return {
          success: false,
          error: 'No customer found for user',
        };
      }

      // Get the current locale from the request
      const locale = await getLocale();

      // Create the portal session with localized URL if no custom return URL is provided
      const returnUrlWithLocale =
        returnUrl || getUrlWithLocale('/settings/billing', locale);
      const params: CreatePortalParams = {
        customerId,
        returnUrl: returnUrlWithLocale,
        locale,
      };

      const result = await createCustomerPortal(params, purchaseProvider);
      // console.log('create customer portal result:', result);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('create customer portal error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
