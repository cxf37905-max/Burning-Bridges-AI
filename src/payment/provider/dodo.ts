import 'server-only';
import { findPaymentPriceKey, websiteConfig } from '@/config/website';
import {
  addCredits,
  addLifetimeMonthlyCredits,
  addSubscriptionCredits,
  hasRecordedPaymentRefund,
  isPaymentFullyRefunded,
  settlePaymentRefund,
  type CreditDatabaseTransaction,
} from '@/credits/credits';
import { getCreditPackageById } from '@/credits/server';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import type { Payment as PaymentRecord } from '@/db/types';
import { findConfiguredPriceById, findPlanByPlanId } from '@/lib/price-plan';
import { sendPaymentNotification } from '@/notification';
import { addDays } from 'date-fns';
import DodoPayments from 'dodopayments';
import type { Payment as DodoPayment } from 'dodopayments/resources/payments';
import type { RefundListItem } from 'dodopayments/resources/payments';
import type { Subscription as DodoSubscription } from 'dodopayments/resources/subscriptions';
import { and, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  type CheckoutResult,
  type CreateCheckoutParams,
  type CreateCreditCheckoutParams,
  type CreatePortalParams,
  type PaymentProvider,
  type PaymentScene,
  PaymentScenes,
  type PaymentStatus,
  PaymentTypes,
  type PortalResult,
  type Price,
} from '../types';

const eventSchema = z.object({
  business_id: z.string().min(1),
  type: z.string().min(1),
  timestamp: z.string(),
  data: z.object({
    payment_id: z.string().min(1).nullish(),
    subscription_id: z.string().min(1).nullish(),
    refund_id: z.string().min(1).nullish(),
  }),
});

function dodoDate(value: string, field: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error(`Dodo ${field}日期无效：${value}`);
  return date;
}

// 与已有支付商共用工厂、套餐、付款记录及积分事务，不使用 Dodo 的独立积分系统。
export class DodoProvider implements PaymentProvider {
  private readonly client: DodoPayments;

  constructor() {
    const bearerToken = process.env.DODO_PAYMENTS_API_KEY;
    const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
    if (!bearerToken || !webhookKey)
      throw new Error(
        '缺少 DODO_PAYMENTS_API_KEY 或 DODO_PAYMENTS_WEBHOOK_KEY'
      );
    if (
      process.env.DODO_DEBUG !== undefined &&
      !['true', 'false'].includes(process.env.DODO_DEBUG)
    )
      throw new Error(`Dodo 测试开关必须是 true 或 false：${process.env.DODO_DEBUG}`);
    this.client = new DodoPayments({
      bearerToken,
      webhookKey,
      environment:
        process.env.DODO_DEBUG === 'true' ? 'test_mode' : 'live_mode',
      timeout: 10000,
      maxRetries: 0,
    });
  }

  getProviderName(): string {
    return 'dodo';
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const plan = findPlanByPlanId(params.planId);
    const price = plan?.prices.find((item) => item.priceId === params.priceId);
    if (
      !plan ||
      !price ||
      plan.isFree ||
      plan.disabled ||
      price.disabled ||
      (price.type === PaymentTypes.ONE_TIME && !plan.isLifetime)
    )
      throw new Error(`无效的 Dodo 套餐：${params.planId}/${params.priceId}`);
    return this.createSession(
      params,
      price,
      plan.isLifetime ? PaymentScenes.LIFETIME : PaymentScenes.SUBSCRIPTION,
      { planId: plan.id }
    );
  }

  async createCreditCheckout(
    params: CreateCreditCheckoutParams
  ): Promise<CheckoutResult> {
    const pack = getCreditPackageById(params.packageId);
    if (
      !websiteConfig.credits.enableCredits ||
      !pack ||
      pack.disabled ||
      pack.price.priceId !== params.priceId
    )
      throw new Error(
        `无效的 Dodo 积分包：${params.packageId}/${params.priceId}`
      );
    return this.createSession(
      params,
      { ...pack.price, type: PaymentTypes.ONE_TIME },
      PaymentScenes.CREDIT,
      { type: 'credit_purchase', packageId: pack.id }
    );
  }

  async createCustomerPortal(
    params: CreatePortalParams
  ): Promise<PortalResult> {
    const session = await this.client.customers.customerPortal.create(
      params.customerId,
      { return_url: params.returnUrl, send_email: false }
    );
    if (!session.link)
      throw new Error(`Dodo 未返回客户门户链接：${params.customerId}`);
    return { url: session.link };
  }

  private async createSession(
    params: CreateCheckoutParams | CreateCreditCheckoutParams,
    price: Price,
    scene: PaymentScene,
    purchaseMetadata: Record<string, string>
  ): Promise<CheckoutResult> {
    const userId = params.metadata?.userId;
    const syncId = params.metadata?.paymentSyncId;
    if (!userId || !syncId || !params.successUrl)
      throw new Error('Dodo 结账缺少用户、同步标识或回跳地址');
    if (findPaymentPriceKey(price.priceId)?.provider !== 'dodo')
      throw new Error(`价格不是 Dodo 产品 ID：${price.priceId}`);
    const product = await this.client.products.retrieve(price.priceId);
    const remote = product.price;
    if (
      product.product_id !== price.priceId ||
      remote.type === 'usage_based_price' ||
      remote.currency !== price.currency ||
      remote.price !== price.amount ||
      (price.type === PaymentTypes.SUBSCRIPTION
        ? remote.type !== 'recurring_price' ||
          remote.payment_frequency_count !== 1 ||
          remote.payment_frequency_interval.toLowerCase() !== price.interval
        : remote.type !== 'one_time_price' || remote.pay_what_you_want)
    )
      throw new Error(`Dodo 产品价格或周期与站内配置不一致：${price.priceId}`);
    const session = await this.client.checkoutSessions.create(
      {
        product_cart: [{ product_id: price.priceId, quantity: 1 }],
        billing_currency: remote.currency,
        customer: {
          email: params.customerEmail,
          name: params.metadata?.userName,
        },
        return_url: params.successUrl,
        cancel_url: params.cancelUrl,
        feature_flags: {
          allow_currency_selection: false,
          allow_discount_code: Boolean(price.allowPromotionCode),
          allow_customer_editing_email: false,
        },
        ...(price.type === PaymentTypes.SUBSCRIPTION
          ? {
              subscription_data: {
                trial_period_days: price.trialPeriodDays ?? 0,
              },
            }
          : {}),
        metadata: {
          ...params.metadata,
          ...purchaseMetadata,
          userId,
          paymentSyncId: syncId,
          priceId: price.priceId,
          scene,
        },
      },
      { idempotencyKey: syncId }
    );
    if (!session.session_id || !session.checkout_url)
      throw new Error('Dodo 未返回结账会话 ID 或链接');
    const db = await getDb();
    await db
      .insert(payment)
      .values({
        id: syncId,
        userId,
        customerId: `dodo:${userId}`,
        priceId: price.priceId,
        type: price.type,
        scene,
        interval: price.interval,
        sessionId: session.session_id,
        paymentSyncId: syncId,
        status: 'incomplete',
        paid: false,
      })
      .onConflictDoNothing({ target: payment.id });
    return { id: session.session_id, url: session.checkout_url };
  }

  async handleWebhookEvent(
    payload: string,
    signature: string,
    headers?: Headers
  ): Promise<void> {
    if (
      !headers?.get('webhook-id') ||
      !headers.get('webhook-timestamp') ||
      !signature
    )
      throw new Error('Dodo 回调缺少签名头');
    const event = eventSchema.parse(
      this.client.webhooks.unwrap(payload, {
        headers: {
          'webhook-id': headers.get('webhook-id')!,
          'webhook-timestamp': headers.get('webhook-timestamp')!,
          'webhook-signature': signature,
        },
      })
    );
    const eventDate = dodoDate(event.timestamp, '事件');
    const events = [
      'payment.succeeded',
      'payment.failed',
      'payment.cancelled',
      'payment.processing',
      'subscription.active',
      'subscription.renewed',
      'subscription.updated',
      'subscription.plan_changed',
      'subscription.cancelled',
      'subscription.expired',
      'subscription.failed',
      'subscription.on_hold',
      'subscription.past_due',
      'subscription.paused',
      'subscription.unpaused',
      'subscription.update_payment_method',
      'refund.succeeded',
    ];
    if (!events.includes(event.type)) {
      // 退款失败、争议及 Dodo 自有积分事件不改变站内积分和权益。
      console.info(`Dodo 事件无需更改权益：${event.type}`);
      return;
    }
    const db = await getDb();
    const result = await db.transaction(async (tx) => {
      // 同一订阅的付款、状态变更及退款使用同一把锁，API 查询也在锁内进行。
      let receipt: DodoPayment | undefined;
      if (
        event.type.startsWith('payment.') ||
        event.type === 'refund.succeeded'
      ) {
        if (!event.data.payment_id)
          throw new Error(`Dodo 回调缺少付款 ID：${event.type}`);
        receipt = await this.client.payments.retrieve(event.data.payment_id);
        if (
          receipt.payment_id !== event.data.payment_id ||
          receipt.business_id !== event.business_id
        )
          throw new Error(
            `Dodo 回调付款或商家不匹配：${event.data.payment_id}`
          );
        if (receipt.is_update_payment_method) return;
        if (receipt.is_multi_subscription)
          throw new Error(
            `Dodo 不支持合并多个套餐的付款：${receipt.payment_id}`
          );
      }
      const subscriptionId =
        receipt?.subscription_id ?? event.data.subscription_id;
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`payment:dodo:${subscriptionId || receipt?.payment_id}`}, 0))`
      );
      // 等待订单锁期间可能已完成退款，必须重新读取原付款，不能使用锁前的快照。
      if (receipt)
        receipt = await this.client.payments.retrieve(receipt.payment_id);
      const subscription = subscriptionId
        ? await this.client.subscriptions.retrieve(subscriptionId)
        : undefined;
      if (subscription && subscription.subscription_id !== subscriptionId)
        throw new Error(`Dodo 返回的订阅 ID 不符：${subscriptionId}`);
      if (!subscription && !receipt)
        throw new Error(`Dodo 回调缺少订阅或付款：${event.type}`);
      const metadata = subscription?.metadata ?? receipt!.metadata;
      const userId = z.string().min(1).parse(metadata.userId);
      const syncId = z.string().min(1).parse(metadata.paymentSyncId);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`
      );
      const records = await tx
        .select()
        .from(payment)
        .where(
          and(
            eq(payment.userId, userId),
            subscriptionId
              ? or(
                  eq(payment.subscriptionId, subscriptionId),
                  eq(payment.paymentSyncId, syncId)
                )
              : eq(payment.paymentSyncId, syncId)
          )
        );
      const record =
        records.find((item) => item.subscriptionId === subscriptionId) ??
        records[0];
      if (!record || findPaymentPriceKey(record.priceId)?.provider !== 'dodo')
        throw new Error(`找不到 Dodo 站内付款记录：${syncId}`);
      if (
        (record.subscriptionId && record.subscriptionId !== subscriptionId) ||
        Boolean(subscription) !== (record.type === PaymentTypes.SUBSCRIPTION) ||
        (receipt?.metadata.userId && receipt.metadata.userId !== userId) ||
        (receipt?.metadata.paymentSyncId &&
          receipt.metadata.paymentSyncId !== syncId) ||
        (!subscription &&
          (receipt!.checkout_session_id !== record.sessionId ||
            metadata.priceId !== record.priceId))
      )
        throw new Error(`Dodo 付款与站内用户或订单不符：${record.id}`);
      let latest = subscription
        ? await this.latestPayment(subscription)
        : receipt?.status === 'succeeded'
          ? receipt
          : undefined;
      // 付款查询可能先于列表索引更新；已查询确认的成功付款仍可作为最新收据。
      if (
        receipt?.status === 'succeeded' &&
        (!latest ||
          dodoDate(receipt.created_at, '付款') >
            dodoDate(latest.created_at, '付款'))
      )
        latest = receipt;
      if (
        latest &&
        (latest.business_id !== event.business_id ||
          latest.customer.customer_id !==
            (subscription?.customer ?? receipt!.customer).customer_id)
      )
        throw new Error(`Dodo 订阅付款商家或客户不匹配：${latest.payment_id}`);
      const currentReceipt = receipt?.status === 'succeeded' ? receipt : latest;
      const priceId = subscription?.product_id ?? record.priceId;
      if (findPaymentPriceKey(priceId)?.provider !== 'dodo')
        throw new Error(`Dodo 订阅产品未配置：${priceId}`);
      if (subscription) this.validateSubscription(subscription, priceId);
      if (!subscription && receipt) {
        const key = findPaymentPriceKey(priceId)?.key;
        const price =
          record.scene === PaymentScenes.CREDIT && key
            ? getCreditPackageById(key.replace(/^credits/, '').toLowerCase())
                ?.price
            : findConfiguredPriceById(priceId);
        if (!price || price.currency !== receipt.currency)
          throw new Error(
            `Dodo 一次性付款币种不符：${receipt.payment_id}/${receipt.currency}`
          );
      }
      if (
        !subscription &&
        receipt &&
        (receipt.product_cart?.length !== 1 ||
          receipt.product_cart[0].product_id !== priceId ||
          receipt.product_cart[0].quantity !== 1)
      )
        throw new Error(`Dodo 一次性付款商品不符：${receipt.payment_id}`);

      if (event.type === 'refund.succeeded') {
        if (!event.data.refund_id || !receipt)
          throw new Error('Dodo 退款通知缺少退款 ID 或原付款');
        const refund = await this.client.refunds.retrieve(event.data.refund_id);
        if (
          refund.refund_id !== event.data.refund_id ||
          refund.business_id !== event.business_id ||
          refund.payment_id !== receipt.payment_id ||
          refund.status !== 'succeeded'
        )
          throw new Error(`Dodo 平台未确认成功退款：${event.data.refund_id}`);
        await this.settleRefund(
          tx,
          record,
          receipt,
          refund,
          latest?.payment_id,
          eventDate
        );
      } else {
        const trial = subscription && this.trialEnd(subscription);
        const refundable = currentReceipt
          ? currentReceipt.refunds.filter(
              (refund) => refund.status === 'succeeded'
            )
          : [];
        const refunded =
          currentReceipt?.refund_status === 'full' ||
          (currentReceipt &&
            (await isPaymentFullyRefunded(
              userId,
              currentReceipt.payment_id,
              tx
            )));
        const grants = [
          'payment.succeeded',
          'subscription.active',
          'subscription.renewed',
          'subscription.unpaused',
          'subscription.plan_changed',
        ];
        if (
          currentReceipt &&
          !refunded &&
          !trial &&
          (!subscription ||
            ['active', 'past_due'].includes(subscription.status)) &&
          grants.includes(event.type)
        )
          await this.grantCredits(tx, record, priceId, currentReceipt);
        // 成功回调可能晚于退款；从平台原付款补齐成功退款，禁止重新开通已全退的权益。
        for (const refund of refundable)
          await this.settleRefund(
            tx,
            record,
            currentReceipt!,
            refund,
            latest?.payment_id,
            dodoDate(refund.created_at, '退款')
          );
      }
      await this.syncPayment(
        tx,
        record,
        subscription,
        latest,
        receipt,
        eventDate
      );
      return {
        record,
        subscription,
        notify:
          event.type === 'payment.succeeded' &&
          receipt?.status === 'succeeded' &&
          record.invoiceId !== receipt.payment_id,
        receipt,
      };
    });
    if (!result) return;
    // 取消失败必须返回错误供平台重试；即使退款已防重，也要继续补做远端取消。
    if (result.subscription && (await hasRecordedPaymentRefund(result.record)))
      await this.cancelRefundedSubscription(result.record, result.subscription);
    if (result.notify && result.receipt) {
      try {
        await sendPaymentNotification({
          sessionId: result.receipt.payment_id,
          customerId: result.receipt.customer.customer_id,
          userName: result.record.userId,
          amount: result.receipt.total_amount / 100,
        });
      } catch (error) {
        // 内部通知失败不撤销已完成的付款；积分和数据库错误仍由路由返回 500。
        console.error(
          `Dodo 付款已入账，通知发送失败：${result.receipt.payment_id}`,
          error
        );
      }
    }
  }

  private validateSubscription(
    subscription: DodoSubscription,
    priceId: string
  ) {
    const price = findConfiguredPriceById(priceId);
    if (
      !price ||
      price.type !== PaymentTypes.SUBSCRIPTION ||
      subscription.quantity !== 1 ||
      subscription.on_demand ||
      subscription.currency !== price.currency ||
      subscription.payment_frequency_count !== 1 ||
      subscription.payment_frequency_interval.toLowerCase() !== price.interval
    )
      throw new Error(
        `Dodo 订阅周期、币种或数量不符：${subscription.subscription_id}`
      );
  }

  private trialEnd(subscription: DodoSubscription): Date | undefined {
    if (subscription.trial_period_days <= 0 || subscription.status !== 'active')
      return;
    const end = addDays(
      dodoDate(subscription.created_at, '试用开始'),
      subscription.trial_period_days
    );
    if (end > new Date()) return end;
  }

  private async latestPayment(
    subscription: DodoSubscription
  ): Promise<DodoPayment | undefined> {
    const receipts: { payment_id: string; created_at: string }[] = [];
    for await (const receipt of this.client.payments.list({
      subscription_id: subscription.subscription_id,
      status: 'succeeded',
    }))
      receipts.push(receipt);
    receipts.sort(
      (left, right) =>
        dodoDate(right.created_at, '付款').getTime() -
        dodoDate(left.created_at, '付款').getTime()
    );
    for (const receipt of receipts) {
      const full = await this.client.payments.retrieve(receipt.payment_id);
      if (
        full.payment_id !== receipt.payment_id ||
        full.subscription_id !== subscription.subscription_id ||
        full.status !== 'succeeded'
      )
        throw new Error(`Dodo 订阅付款关联不符：${receipt.payment_id}`);
      if (!full.is_update_payment_method) return full;
    }
  }

  private async grantCredits(
    tx: CreditDatabaseTransaction,
    record: PaymentRecord,
    priceId: string,
    receipt: DodoPayment
  ): Promise<void> {
    const date = dodoDate(receipt.created_at, '积分所属付款');
    if (!Number.isSafeInteger(receipt.total_amount) || receipt.total_amount < 0)
      throw new Error(
        `Dodo 付款金额无效：${receipt.payment_id}/${receipt.total_amount}`
      );
    if (record.scene === PaymentScenes.CREDIT) {
      const key = findPaymentPriceKey(priceId)?.key;
      const pack = key
        ? getCreditPackageById(key.replace(/^credits/, '').toLowerCase())
        : undefined;
      if (!pack) throw new Error(`Dodo 积分包未配置：${priceId}`);
      if (websiteConfig.credits.enableCredits && pack.amount > 0)
        await addCredits({
          userId: record.userId,
          amount: pack.amount,
          type: CREDIT_TRANSACTION_TYPE.PURCHASE_PACKAGE,
          description: `Dodo 积分包购买：${pack.id}`,
          paymentId: receipt.payment_id,
          idempotencyKey: `payment:dodo:${receipt.payment_id}`,
          expireDays: pack.expireDays,
          transaction: tx,
        });
    } else if (record.type === PaymentTypes.SUBSCRIPTION) {
      await addSubscriptionCredits(
        record.userId,
        priceId,
        date,
        receipt.payment_id,
        tx
      );
    } else {
      await addLifetimeMonthlyCredits(
        record.userId,
        priceId,
        date,
        receipt.payment_id,
        tx
      );
    }
  }

  private async settleRefund(
    tx: CreditDatabaseTransaction,
    record: PaymentRecord,
    receipt: DodoPayment,
    refund: RefundListItem,
    latestPaymentId: string | undefined,
    processedAt: Date
  ) {
    if (
      receipt.status !== 'succeeded' ||
      refund.payment_id !== receipt.payment_id ||
      refund.status !== 'succeeded' ||
      refund.currency !== receipt.currency ||
      !Number.isSafeInteger(refund.amount)
    )
      throw new Error(`Dodo 退款付款、金额或币种无效：${refund.refund_id}`);
    await settlePaymentRefund({
      provider: 'dodo',
      refundId: refund.refund_id,
      record,
      paymentId: receipt.payment_id,
      originalAmount: receipt.total_amount,
      refundedAmount: refund.amount!,
      fullRefund: receipt.refund_status === 'full',
      latestPaymentId,
      transaction: tx,
      processedAt,
    });
  }

  private async syncPayment(
    tx: CreditDatabaseTransaction,
    record: PaymentRecord,
    subscription: DodoSubscription | undefined,
    latest: DodoPayment | undefined,
    receipt: DodoPayment | undefined,
    eventDate: Date
  ) {
    const latestRefunded =
      latest &&
      (latest.refund_status === 'full' ||
        (await isPaymentFullyRefunded(record.userId, latest.payment_id, tx)));
    const trialEnd = subscription && this.trialEnd(subscription);
    const statusMap: Record<string, PaymentStatus> = {
      pending: 'incomplete',
      active: 'active',
      cancelled: 'canceled',
      expired: 'canceled',
      failed: 'failed',
      on_hold: 'past_due',
      past_due: 'past_due',
      paused: 'paused',
      succeeded: 'completed',
      processing: 'processing',
      requires_customer_action: 'incomplete',
      requires_merchant_action: 'incomplete',
      requires_payment_method: 'incomplete',
      requires_confirmation: 'incomplete',
      requires_capture: 'processing',
    };
    const remoteStatus = subscription?.status ?? receipt?.status ?? 'pending';
    let status = statusMap[remoteStatus];
    if (!status) throw new Error(`Dodo 状态不支持：${remoteStatus}`);
    if (trialEnd) status = 'trialing';
    if (latestRefunded) status = 'canceled';
    await tx
      .update(payment)
      .set({
        priceId: subscription?.product_id ?? record.priceId,
        customerId: (subscription?.customer ?? receipt!.customer).customer_id,
        subscriptionId: subscription?.subscription_id ?? null,
        invoiceId: latest?.payment_id ?? record.invoiceId,
        interval: subscription
          ? findConfiguredPriceById(subscription.product_id)?.interval
          : record.interval,
        status,
        paid:
          !latestRefunded &&
          Boolean(latest || trialEnd) &&
          !['canceled', 'failed', 'incomplete'].includes(status),
        periodStart: subscription
          ? dodoDate(subscription.previous_billing_date, '账期开始')
          : null,
        periodEnd: subscription
          ? dodoDate(subscription.next_billing_date, '账期结束')
          : null,
        cancelAtPeriodEnd:
          !latestRefunded && Boolean(subscription?.cancel_at_next_billing_date),
        trialStart:
          trialEnd && subscription
            ? dodoDate(subscription.created_at, '试用开始')
            : null,
        trialEnd: trialEnd ?? null,
        // 查询的是平台当前状态，迟到事件不能把同步时间倒退。
        webhookProcessedAt: ['incomplete', 'processing'].includes(status)
          ? record.webhookProcessedAt
          : record.webhookProcessedAt && record.webhookProcessedAt > eventDate
            ? record.webhookProcessedAt
            : eventDate,
        updatedAt: new Date(),
      })
      .where(eq(payment.id, record.id));
  }

  private async cancelRefundedSubscription(
    record: PaymentRecord,
    subscription: DodoSubscription
  ): Promise<void> {
    let current = await this.client.subscriptions.retrieve(
      subscription.subscription_id
    );
    if (
      !['cancelled', 'expired', 'failed'].includes(current.status) &&
      !current.cancel_at_next_billing_date
    )
      current = await this.client.subscriptions.update(
        current.subscription_id,
        { cancel_at_next_billing_date: true }
      );
    const ended = ['cancelled', 'expired', 'failed'].includes(current.status);
    if (
      current.subscription_id !== subscription.subscription_id ||
      (!ended && !current.cancel_at_next_billing_date)
    )
      throw new Error(
        `Dodo 未确认退款后停止续费：${subscription.subscription_id}`
      );
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${record.userId}, 0))`
      );
      const [local] = await tx
        .select()
        .from(payment)
        .where(eq(payment.id, record.id))
        .limit(1);
      if (!local) throw new Error(`Dodo 取消后找不到付款记录：${record.id}`);
      await tx
        .update(payment)
        .set({
          cancelAtPeriodEnd:
            !ended && local.paid && local.status !== 'canceled',
          ...(ended ? { status: 'canceled' as const, paid: false } : {}),
          updatedAt: new Date(),
        })
        .where(eq(payment.id, record.id));
    });
  }
}
