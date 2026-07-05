'use server';

import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { userActionClient } from '@/lib/safe-action';
import { and, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';

const checkPaymentSyncSchema = z.object({
  syncId: z.string().min(1, { error: 'Sync ID is required' }),
});

export const checkPaymentSyncAction = userActionClient
  .inputSchema(checkPaymentSyncSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { syncId } = parsedInput;

    try {
      const db = await getDb();
      const records = await db
        .select({ id: payment.id })
        .from(payment)
        .where(
          and(
            eq(payment.userId, ctx.user.id),
            eq(payment.paymentSyncId, syncId),
            isNotNull(payment.webhookProcessedAt)
          )
        )
        .limit(1);

      return {
        success: true,
        synced: records.length > 0,
      };
    } catch (error) {
      console.error('check payment sync error:', error);
      return {
        success: false,
        synced: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to check payment sync',
      };
    }
  });
