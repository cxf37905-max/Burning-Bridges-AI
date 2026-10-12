import {
  automaticCreditGrantsEnabled,
  purchasedCreditValidityMonths,
} from './policy';
import { randomUUID } from 'crypto';
import { websiteConfig } from '@/config/website';
import { getDb } from '@/db';
import { creditTransaction, userCredit } from '@/db/schema';
import { findPlanByPlanId, findPlanByPriceId } from '@/lib/price-plan';
import { addDays, addMonths } from 'date-fns';
import { and, asc, eq, gt, isNull, lte, not, or, sql } from 'drizzle-orm';
import { CREDIT_TRANSACTION_TYPE } from './types';

type CreditDatabase = Awaited<ReturnType<typeof getDb>>;
type CreditDatabaseTransaction = Parameters<
  Parameters<CreditDatabase['transaction']>[0]
>[0];

export class InsufficientCreditsError extends Error {}

async function lockUserCredits(tx: CreditDatabaseTransaction, userId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`
  );
}

function getMonthlyCreditKey(type: string, userId: string, date = new Date()) {
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `monthly:${type}:${userId}:${month}`;
}

/**
 * Get user's current credit balance
 * @param userId - User ID
 * @returns User's current credit balance
 */
export async function getUserCredits(userId: string): Promise<number> {
  await processExpiredCredits(userId);
  const db = await getDb();
  const records = await db
    .select({ currentCredits: userCredit.currentCredits })
    .from(userCredit)
    .where(eq(userCredit.userId, userId))
    .limit(2);

  if (records.length > 1) {
    throw new Error(`Multiple credit balance records found for user ${userId}`);
  }

  return records[0]?.currentCredits ?? 0;
}

/**
 * Write a credit transaction record
 * @param params - Credit transaction parameters
 */
async function saveCreditTransaction(
  tx: CreditDatabaseTransaction,
  {
    userId,
    type,
    amount,
    description,
    paymentId,
    idempotencyKey,
    expirationDate,
  }: {
    userId: string;
    type: string;
    amount: number;
    description: string;
    paymentId?: string;
    idempotencyKey?: string;
    expirationDate?: Date;
  }
) {
  if (!userId || !type || !description) {
    console.error(
      'saveCreditTransaction, invalid params',
      userId,
      type,
      description
    );
    throw new Error('saveCreditTransaction, invalid params');
  }
  if (!Number.isFinite(amount) || amount === 0) {
    console.error('saveCreditTransaction, invalid amount', userId, amount);
    throw new Error('saveCreditTransaction, invalid amount');
  }
  const [record] = await tx
    .insert(creditTransaction)
    .values({
      id: randomUUID(),
      userId,
      type,
      amount,
      // remaining amount is the same as amount for earn transactions
      // remaining amount is null for spend transactions
      remainingAmount: amount > 0 ? amount : null,
      description,
      paymentId,
      idempotencyKey,
      expirationDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: creditTransaction.id });
  return record;
}

/**
 * Add credits (registration, monthly, purchase, etc.)
 * @param params - Credit creation parameters
 */

type CreditGrant = {
  userId: string;
  amount: number;
  type: string;
  description: string;
  paymentId?: string;
  idempotencyKey: string;
  expireDays?: number;
  expirationDate?: Date;
  transaction?: CreditDatabaseTransaction;
};
export async function addCredits(grant: CreditGrant) {
  if (
    grant.type !== CREDIT_TRANSACTION_TYPE.PURCHASE_PACKAGE ||
    !grant.paymentId
  )
    throw new Error('Only verified purchases can grant new credits.');
  if (grant.transaction)
    return grantCreditsInTransaction(grant.transaction, grant);
  const db = await getDb();
  return db.transaction((tx) => grantCreditsInTransaction(tx, grant));
}
// 购买、扣费、退款与父业务记录共用事务，防止只更新其中一侧。
async function grantCreditsInTransaction(
  tx: CreditDatabaseTransaction,
  {
    userId,
    amount,
    type,
    description,
    paymentId,
    idempotencyKey,
    expireDays,
    expirationDate,
  }: CreditGrant
) {
  if (
    !userId ||
    !description ||
    !idempotencyKey ||
    !Number.isInteger(amount) ||
    amount <= 0
  )
    throw new Error('Invalid credit grant: ' + idempotencyKey);
  if (
    expireDays !== undefined &&
    (!Number.isFinite(expireDays) || expireDays <= 0)
  )
    throw new Error('Invalid expiration: ' + expireDays);
  if (expirationDate && !Number.isFinite(expirationDate.getTime()))
    throw new Error(
      'Invalid expiration date for credit grant: ' + idempotencyKey
    );
  await lockUserCredits(tx, userId);
  const now = new Date();
  const transaction = await tx
    .insert(creditTransaction)
    .values({
      id: randomUUID(),
      userId,
      type,
      amount,
      remainingAmount: amount,
      description,
      paymentId,
      idempotencyKey,
      expirationDate:
        type === CREDIT_TRANSACTION_TYPE.PURCHASE_PACKAGE
          ? addMonths(now, purchasedCreditValidityMonths)
          : (expirationDate ??
            (expireDays ? addDays(now, expireDays) : undefined)),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: creditTransaction.idempotencyKey })
    .returning({ id: creditTransaction.id });

  if (transaction.length === 0) return false;

  const balances = await tx
    .select({ id: userCredit.id })
    .from(userCredit)
    .where(eq(userCredit.userId, userId))
    .limit(2);

  if (balances.length > 1) {
    throw new Error(`Multiple credit balance records found for user ${userId}`);
  }

  if (balances[0]) {
    await tx
      .update(userCredit)
      .set({
        currentCredits: sql`${userCredit.currentCredits} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(userCredit.id, balances[0].id));
  } else {
    await tx.insert(userCredit).values({
      id: randomUUID(),
      userId,
      currentCredits: amount,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  await expireUserCreditsInTransaction(tx, userId, now);
  return true;
}
export async function refundVideoCreditsInTransaction(
  tx: CreditDatabaseTransaction,
  { userId, videoId }: { userId: string; videoId: string }
) {
  await lockUserCredits(tx, userId);
  const [debit] = await tx
    .select()
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.userId, userId),
        eq(creditTransaction.idempotencyKey, 'video:' + videoId),
        eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.USAGE)
      )
    );
  if (!debit || debit.amount >= 0)
    throw new Error('No original video debit exists: ' + videoId);
  return grantCreditsInTransaction(tx, {
    userId,
    amount: -debit.amount,
    type: CREDIT_TRANSACTION_TYPE.REFUND,
    description: 'Failed video refund',
    paymentId: videoId,
    idempotencyKey: 'video-refund:' + videoId,
    expirationDate:
      debit.expirationDate ??
      addMonths(debit.createdAt, purchasedCreditValidityMonths),
  });
}

/**
 * Check if user has enough credits
 * @param userId - User ID
 * @param requiredCredits - Required credits
 */
export async function hasEnoughCredits({
  userId,
  requiredCredits,
}: {
  userId: string;
  requiredCredits: number;
}) {
  const balance = await getUserCredits(userId);
  return balance >= requiredCredits;
}

/**
 * Consume credits (FIFO, by expiration)
 * @param params - Credit consumption parameters
 */

type CreditConsumption = {
  userId: string;
  amount: number;
  description: string;
  idempotencyKey?: string;
};
export async function consumeCredits(consumption: CreditConsumption) {
  const db = await getDb();
  return db.transaction((tx) => consumeCreditsInTransaction(tx, consumption));
}
export async function consumeCreditsInTransaction(
  tx: CreditDatabaseTransaction,
  { userId, amount, description, idempotencyKey }: CreditConsumption
) {
  if (!userId || !description || !Number.isInteger(amount) || amount <= 0)
    throw new Error(
      'Invalid credit consumption for user ' + userId + ': ' + amount
    );
  await lockUserCredits(tx, userId);
  const now = new Date();

  if (idempotencyKey) {
    const [existing] = await tx
      .select({ id: creditTransaction.id })
      .from(creditTransaction)
      .where(eq(creditTransaction.idempotencyKey, idempotencyKey));
    if (existing) return;
  }
  await expireUserCreditsInTransaction(tx, userId, now);
  const balances = await tx
    .select({ id: userCredit.id, currentCredits: userCredit.currentCredits })
    .from(userCredit)
    .where(eq(userCredit.userId, userId))
    .limit(2);

  if (balances.length > 1) {
    throw new Error(`Multiple credit balance records found for user ${userId}`);
  }

  const balance = balances[0];
  if (!balance || balance.currentCredits < amount) {
    throw new InsufficientCreditsError(
      `Insufficient credits for user ${userId}: ${amount}`
    );
  }

  const transactions = await tx
    .select()
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.userId, userId),
        not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.USAGE)),
        not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.EXPIRE)),
        gt(creditTransaction.remainingAmount, 0),
        or(
          isNull(creditTransaction.expirationDate),
          gt(creditTransaction.expirationDate, now)
        )
      )
    )
    .orderBy(
      asc(creditTransaction.expirationDate),
      asc(creditTransaction.createdAt)
    );

  let remainingToDeduct = amount;
  let expirationDate: Date | undefined;
  for (const transaction of transactions) {
    if (remainingToDeduct <= 0) break;
    const remainingAmount = transaction.remainingAmount ?? 0;
    const deductFromThis = Math.min(remainingAmount, remainingToDeduct);
    if (
      transaction.expirationDate &&
      (!expirationDate || transaction.expirationDate < expirationDate)
    ) {
      expirationDate = transaction.expirationDate;
    }
    await tx
      .update(creditTransaction)
      .set({
        remainingAmount: remainingAmount - deductFromThis,
        updatedAt: now,
      })
      .where(eq(creditTransaction.id, transaction.id));
    remainingToDeduct -= deductFromThis;
  }

  if (remainingToDeduct > 0) {
    throw new Error(
      `Credit ledger is short for user ${userId}: ${remainingToDeduct}`
    );
  }

  await tx
    .update(userCredit)
    .set({ currentCredits: balance.currentCredits - amount, updatedAt: now })
    .where(eq(userCredit.id, balance.id));

  await saveCreditTransaction(tx, {
    userId,
    type: CREDIT_TRANSACTION_TYPE.USAGE,
    amount: -amount,
    description,
    idempotencyKey,
    expirationDate,
  });
}

/**
 * Process expired credits
 * @param userId - User ID
 */
export async function processExpiredCredits(userId: string) {
  return processExpiredCreditsForUsers([userId]);
}

export async function processExpiredCreditsForUsers(userIds: string[]) {
  const db = await getDb();
  let processedCount = 0;
  let totalExpiredCredits = 0;

  for (const userId of [...new Set(userIds)]) {
    const expiredTotal = await db.transaction(async (tx) => {
      await lockUserCredits(tx, userId);
      return expireUserCreditsInTransaction(tx, userId, new Date());
    });

    processedCount++;
    totalExpiredCredits += expiredTotal;
  }

  return { processedCount, totalExpiredCredits };
}

// 调用方已锁定用户余额，清理和扣费必须处于同一事务。
async function expireUserCreditsInTransaction(
  tx: CreditDatabaseTransaction,
  userId: string,
  now: Date
) {
  const transactions = await tx
    .select()
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.userId, userId),
        not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.USAGE)),
        not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.EXPIRE)),
        isNull(creditTransaction.expirationDateProcessedAt),
        gt(creditTransaction.remainingAmount, 0),
        lte(creditTransaction.expirationDate, now)
      )
    );
  const total = transactions.reduce(
    (sum, transaction) => sum + (transaction.remainingAmount ?? 0),
    0
  );
  if (total === 0) return 0;

  for (const transaction of transactions) {
    await tx
      .update(creditTransaction)
      .set({
        remainingAmount: 0,
        expirationDateProcessedAt: now,
        updatedAt: now,
      })
      .where(eq(creditTransaction.id, transaction.id));
  }

  const balances = await tx
    .select({ id: userCredit.id, currentCredits: userCredit.currentCredits })
    .from(userCredit)
    .where(eq(userCredit.userId, userId))
    .limit(2);
  if (balances.length > 1) {
    throw new Error(`Multiple credit balance records found for user ${userId}`);
  }
  if (balances[0]) {
    await tx
      .update(userCredit)
      .set({
        currentCredits: Math.max(0, balances[0].currentCredits - total),
        updatedAt: now,
      })
      .where(eq(userCredit.id, balances[0].id));
  }
  await saveCreditTransaction(tx, {
    userId,
    type: CREDIT_TRANSACTION_TYPE.EXPIRE,
    amount: -total,
    description: `Expire credits: ${total}`,
  });
  return total;
}

/**
 * Check if specific type of credits can be added for a user based on transaction history
 * @param userId - User ID
 * @param creditType - Type of credit transaction to check
 */
export async function canAddCreditsByType(
  userId: string,
  creditType: string,
  grantDate = new Date(),
  transaction?: CreditDatabaseTransaction
) {
  const db = transaction ?? (await getDb());
  const now = grantDate;
  const existingTransaction = await db
    .select()
    .from(creditTransaction)
    .where(
      or(
        eq(
          creditTransaction.idempotencyKey,
          getMonthlyCreditKey(creditType, userId, now)
        ),
        and(
          eq(creditTransaction.userId, userId),
          eq(creditTransaction.type, creditType),
          sql`EXTRACT(MONTH FROM ${creditTransaction.createdAt}) = ${now.getMonth() + 1}`,
          sql`EXTRACT(YEAR FROM ${creditTransaction.createdAt}) = ${now.getFullYear()}`
        )
      )
    )
    .limit(1);

  return existingTransaction.length === 0;
}

/**
 * Check if subscription credits can be added for a user based on last refresh time
 * @param userId - User ID
 */

/**
 * Add register gift credits
 * @param userId - User ID
 */
export async function addRegisterGiftCredits(userId: string) {
  const gift = websiteConfig.credits.registerGiftCredits;
  if (
    !automaticCreditGrantsEnabled ||
    !websiteConfig.credits.enableCredits ||
    !gift.enable ||
    gift.amount <= 0
  ) {
    return false;
  }

  return addCredits({
    userId,
    amount: gift.amount,
    type: CREDIT_TRANSACTION_TYPE.REGISTER_GIFT,
    description: `Register gift credits: ${gift.amount}`,
    idempotencyKey: `register-gift:${userId}`,
    expireDays: gift.expireDays,
  });
}

/**
 * Add free monthly credits
 * @param userId - User ID
 * @param planId - Plan ID
 */
export async function addMonthlyFreeCredits(userId: string, planId: string) {
  // NOTICE: make sure the free plan is not disabled and has credits enabled
  const pricePlan = findPlanByPlanId(planId);
  if (
    !automaticCreditGrantsEnabled ||
    !websiteConfig.credits.enableCredits ||
    !pricePlan ||
    pricePlan.disabled ||
    !pricePlan.isFree ||
    !pricePlan.credits ||
    !pricePlan.credits.enable ||
    pricePlan.credits.amount <= 0
  ) {
    console.log(
      `addMonthlyFreeCredits, no credits configured for plan ${planId}`
    );
    return;
  }

  const now = new Date();
  if (
    !(await canAddCreditsByType(
      userId,
      CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH
    ))
  ) {
    return false;
  }
  const credits = pricePlan.credits.amount;
  return addCredits({
    userId,
    amount: credits,
    type: CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
    description: `Free monthly credits: ${credits} for ${now.getFullYear()}-${now.getMonth() + 1}`,
    idempotencyKey: getMonthlyCreditKey(
      CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
      userId,
      now
    ),
    expireDays: pricePlan.credits.expireDays,
  });
}

/**
 * Add subscription credits
 * @param userId - User ID
 * @param priceId - Price ID
 */
export async function addSubscriptionCredits(
  userId: string,
  priceId: string,
  grantDate = new Date(),
  paymentId?: string,
  transaction?: CreditDatabaseTransaction
) {
  // NOTICE: the price plan maybe disabled, but we still need to add credits for existing users
  const pricePlan = findPlanByPriceId(priceId);
  if (
    !automaticCreditGrantsEnabled ||
    !websiteConfig.credits.enableCredits ||
    !pricePlan ||
    // pricePlan.disabled ||
    !pricePlan.credits ||
    !pricePlan.credits.enable ||
    pricePlan.credits.amount <= 0
  ) {
    console.log(
      `addSubscriptionCredits, no credits configured for plan ${priceId}`
    );
    return;
  }

  const month = grantDate.getMonth() + 1;
  if (
    !(await canAddCreditsByType(
      userId,
      CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
      grantDate,
      transaction
    ))
  ) {
    return false;
  }
  const credits = pricePlan.credits.amount;
  return addCredits({
    userId,
    amount: credits,
    type: CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
    paymentId,
    transaction,
    description: `Subscription renewal credits: ${credits} for ${grantDate.getFullYear()}-${month}`,
    idempotencyKey: getMonthlyCreditKey(
      CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
      userId,
      grantDate
    ),
    expireDays: pricePlan.credits.expireDays,
  });
}

/**
 * Add lifetime monthly credits
 * @param userId - User ID
 * @param priceId - Price ID
 */
export async function addLifetimeMonthlyCredits(
  userId: string,
  priceId: string,
  grantDate = new Date(),
  paymentId?: string,
  transaction?: CreditDatabaseTransaction
) {
  // NOTICE: make sure the lifetime plan is not disabled and has credits enabled
  const pricePlan = findPlanByPriceId(priceId);
  if (
    !automaticCreditGrantsEnabled ||
    !websiteConfig.credits.enableCredits ||
    !pricePlan ||
    !pricePlan.isLifetime ||
    pricePlan.disabled ||
    !pricePlan.credits ||
    !pricePlan.credits.enable ||
    pricePlan.credits.amount <= 0
  ) {
    console.log(
      `addLifetimeMonthlyCredits, no credits configured for plan ${priceId}`
    );
    return;
  }

  if (
    !(await canAddCreditsByType(
      userId,
      CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY,
      grantDate,
      transaction
    ))
  ) {
    return false;
  }
  const credits = pricePlan.credits.amount;
  return addCredits({
    userId,
    amount: credits,
    type: CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY,
    paymentId,
    transaction,
    description: `Lifetime monthly credits: ${credits} for ${grantDate.getFullYear()}-${grantDate.getMonth() + 1}`,
    idempotencyKey: getMonthlyCreditKey(
      CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY,
      userId,
      grantDate
    ),
    expireDays: pricePlan.credits.expireDays,
  });
}
