import 'server-only';
import { randomUUID } from 'crypto';
import { findPaymentPriceKey, websiteConfig } from '@/config/website';
import {
  addCredits,
  addLifetimeMonthlyCredits,
  addSubscriptionCredits,
} from '@/credits/credits';
import { getCreditPackageById } from '@/credits/server';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { getDb } from '@/db';
import { creditTransaction, payment, userCredit } from '@/db/schema';
import { findConfiguredPriceById, findPlanByPlanId } from '@/lib/price-plan';
import { sendPaymentNotification } from '@/notification';
import { WaffoPancake, verifyWebhook } from '@waffo/pancake-ts';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  type CheckoutResult,
  type CreateCheckoutParams,
  type CreateCreditCheckoutParams,
  type PaymentProvider,
  type PaymentScene,
  PaymentScenes,
  type PaymentStatus,
  PaymentTypes,
  PlanIntervals,
  type PortalResult,
  type Price,
} from '../types';

// GraphQL 的 JSON 字段可能返回对象或序列化字符串，在支付商边界统一解析。
const waffoMetadataSchema = z.preprocess((value, context) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch (reason) {
    if (!(reason instanceof SyntaxError)) throw reason;
    context.addIssue({
      code: 'custom',
      message: 'Waffo metadata 必须是有效的 JSON 对象',
    });
    return z.NEVER;
  }
}, z.record(z.string(), z.string()).nullish());

const waffoProductSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  billingPeriod: z.string().nullish(),
  metadata: waffoMetadataSchema,
  prices: z.array(
    z.object({
      currency: z.string(),
      priceInfo: z.object({ amount: z.string() }),
    })
  ),
});
const waffoOrderSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  testMode: z.boolean(),
  currency: z.string().length(3),
  metadata: waffoMetadataSchema,
  orderMerchantExternalId: z.string().nullish(),
  onetimeProduct: z.object({ id: z.string() }).nullish(),
  subscriptionProduct: z.object({ id: z.string() }).nullish(),
  currentPeriodStart: z.string().nullish(),
  currentPeriodEnd: z.string().nullish(),
  payments: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      createdAt: z.string(),
      periodNumber: z.number().nullish(),
      isFullyRefunded: z.boolean(),
      refundStatus: z.string(),
      amount: z.object({
        amount: z.string(),
        currency: z.string(),
        display: z.string(),
      }),
      refunds: z.array(
        z.object({
          id: z.string(),
          status: z.string(),
          createdAt: z.string(),
          pspAmountDetails: z
            .object({ amount: z.string(), currency: z.string() })
            .nullable(),
        })
      ),
    })
  ),
});
type WaffoOrder = z.infer<typeof waffoOrderSchema>;
type PaymentRecord = typeof payment.$inferSelect;
type PaymentTransaction = Parameters<
  Parameters<Awaited<ReturnType<typeof getDb>>['transaction']>[0]
>[0];
const waffoEventSchema = z.object({
  timestamp: z.string(),
  eventType: z.string(),
  eventId: z.string().min(1),
  storeId: z.string(),
  mode: z.enum(['test', 'prod']),
  data: z.object({
    orderId: z.string().min(1),
    currency: z.string().length(3),
    orderMerchantExternalId: z.string().optional(),
    orderMetadata: waffoMetadataSchema,
    chargedAmount: z.string().optional(),
    refundedAmount: z.string().optional(),
    originalChargedAmount: z.string().optional(),
    paymentId: z.string().optional(),
    paymentStatus: z.string().optional(),
    paymentDate: z.string().optional(),
    currentPeriodStart: z.string().optional(),
    currentPeriodEnd: z.string().optional(),
    refundStatus: z.string().optional(),
    productName: z.string().optional(),
    amount: z.string().optional(),
  }),
});
type WaffoEvent = z.infer<typeof waffoEventSchema>;

function waffoDate(value: string | undefined | null, field: string): Date {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) {
    throw new Error(`Waffo ${field} 日期无效：${value}`);
  }
  return date;
}

function minorAmount(value: string, currency: string): number {
  const decimals =
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`Waffo 金额格式无效：${currency}/${value}`);
  }
  const [whole, fraction = ''] = value.split('.');
  if (fraction.slice(decimals).replace(/0/g, '')) {
    throw new Error(`Waffo 金额精度无效：${currency}/${value}`);
  }
  const amount = Number(
    whole + fraction.slice(0, decimals).padEnd(decimals, '0')
  );
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`Waffo 金额超出范围：${currency}/${value}`);
  }
  return amount;
}

function latestSuccessfulPayment(order: WaffoOrder) {
  return order.payments
    .filter((receipt) => receipt.status === 'succeeded')
    .sort(
      (left, right) =>
        waffoDate(right.createdAt, '付款时间').getTime() -
        waffoDate(left.createdAt, '付款时间').getTime()
    )[0];
}

// 与其他支付商一致：共用工厂接口，支付商自己的 API 和回调细节留在本文件。
export class WaffoProvider implements PaymentProvider {
  private readonly client: WaffoPancake;
  private readonly storeId: string;
  private readonly environment: 'test' | 'prod';

  constructor() {
    const merchantId = process.env.WAFFO_MERCHANT_ID;
    const privateKey = process.env.WAFFO_PRIVATE_KEY;
    const storeId = process.env.WAFFO_STORE_ID;
    if (!merchantId || !privateKey || !storeId) {
      throw new Error(
        '缺少 WAFFO_MERCHANT_ID、WAFFO_PRIVATE_KEY 或 WAFFO_STORE_ID'
      );
    }
    if (
      process.env.WAFFO_DEBUG !== undefined &&
      !['true', 'false'].includes(process.env.WAFFO_DEBUG)
    ) {
      throw new Error(
        `Waffo 测试开关必须是 true 或 false：${process.env.WAFFO_DEBUG}`
      );
    }
    this.storeId = storeId;
    this.environment = process.env.WAFFO_DEBUG === 'true' ? 'test' : 'prod';
    this.client = new WaffoPancake({
      merchantId,
      privateKey: privateKey.replace(/\\n/g, '\n'),
      environment: this.environment,
      fetch: (url, options) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(4000) }),
    });
  }

  getProviderName(): string {
    return 'waffo';
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const plan = findPlanByPlanId(params.planId);
    const price = plan?.prices.find((item) => item.priceId === params.priceId);
    if (!plan || !price || plan.isFree || plan.disabled || price.disabled) {
      throw new Error(
        `无效的 Waffo 套餐或价格：${params.planId}/${params.priceId}`
      );
    }
    if (price.type === PaymentTypes.ONE_TIME && !plan.isLifetime) {
      throw new Error(`Waffo 不支持此一次性套餐：${params.planId}`);
    }
    return this.createSession(
      params,
      price,
      price.type === PaymentTypes.SUBSCRIPTION
        ? PaymentScenes.SUBSCRIPTION
        : PaymentScenes.LIFETIME,
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
    ) {
      throw new Error(
        `无效的 Waffo 积分包：${params.packageId}/${params.priceId}`
      );
    }
    if (
      Object.values(websiteConfig.credits.packages).filter(
        (item) => item.price.priceId === params.priceId
      ).length !== 1
    ) {
      throw new Error(
        `多个积分包使用了同一个 Waffo 产品 ID：${params.priceId}`
      );
    }
    return this.createSession(
      params,
      { ...pack.price, type: PaymentTypes.ONE_TIME },
      PaymentScenes.CREDIT,
      { type: 'credit_purchase', packageId: pack.id }
    );
  }

  async createCustomerPortal(): Promise<PortalResult> {
    // 官方门户通过购买邮箱的 Magic Link 登录，没有签发免登录门户链接的 API。
    return { url: 'https://pancake.waffo.ai/consumer/portal/login' };
  }

  private async createSession(
    params: CreateCheckoutParams | CreateCreditCheckoutParams,
    price: Price,
    scene: PaymentScene,
    purchaseMetadata: Record<string, string>
  ): Promise<CheckoutResult> {
    const userId = params.metadata?.userId;
    const syncId = params.metadata?.paymentSyncId;
    if (!userId || !syncId || !params.successUrl) {
      throw new Error('Waffo 结账缺少用户、同步标识或成功回跳地址');
    }
    if (new URL(params.successUrl).protocol !== 'https:') {
      throw new Error(
        'Waffo 成功回跳地址必须使用 HTTPS，本地测试请使用 HTTPS 隧道'
      );
    }
    if (findPaymentPriceKey(price.priceId)?.provider !== 'waffo') {
      throw new Error(`价格不是 Waffo 产品 ID：${price.priceId}`);
    }
    await this.validateProduct(price);
    const session = await this.client.checkout.createSession(
      {
        productId: price.priceId,
        currency: price.currency,
        buyerEmail: params.customerEmail,
        successUrl: params.successUrl,
        language: params.locale === 'zh' ? 'zh-Hans' : 'en',
        // 不跟随后台默认试用规则开通试用；有试用时要求后台天数与站内配置一致。
        withTrial: Boolean(price.trialPeriodDays && price.trialPeriodDays > 0),
        orderMerchantExternalId: syncId,
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
    if (!session.sessionId || !session.checkoutUrl) {
      throw new Error('Waffo 未返回结账会话 ID 或链接');
    }
    const checkoutUrl = new URL(session.checkoutUrl);
    if (
      checkoutUrl.protocol !== 'https:' ||
      checkoutUrl.username ||
      checkoutUrl.password ||
      !(
        checkoutUrl.hostname === 'waffo.ai' ||
        checkoutUrl.hostname.endsWith('.waffo.ai')
      )
    ) {
      throw new Error(`Waffo 收银台地址无效：${checkoutUrl.hostname}`);
    }
    if (this.environment === 'test')
      checkoutUrl.searchParams.set('test', 'true');
    const db = await getDb();
    await db
      .insert(payment)
      .values({
        id: syncId,
        priceId: price.priceId,
        userId,
        customerId: `waffo:${userId}`,
        sessionId: session.sessionId,
        paymentSyncId: syncId,
        type: price.type,
        scene,
        interval: price.interval,
        status: 'incomplete',
        paid: false,
      })
      .onConflictDoNothing({ target: payment.id });
    return { id: session.sessionId, url: checkoutUrl.toString() };
  }

  private async validateProduct(price: Price): Promise<void> {
    const field =
      price.type === PaymentTypes.SUBSCRIPTION
        ? 'subscriptionProducts'
        : 'onetimeProducts';
    const result = await this.client.graphql.query({
      query: `query($storeId: String!, $id: String!) {
        ${field}(storeId: $storeId, filter: { id: { eq: $id } }) {
          id status metadata ${price.type === PaymentTypes.SUBSCRIPTION ? 'billingPeriod' : ''}
          prices { currency priceInfo { amount } }
        }
      }`,
      variables: { storeId: this.storeId, id: price.priceId },
    });
    if (result.errors?.length) {
      throw new Error(`Waffo 查询产品失败：${result.errors[0].message}`);
    }
    const products = z
      .record(z.string(), z.array(waffoProductSchema))
      .parse(result.data);
    const product = products[field]?.find((item) => item.id === price.priceId);
    const remotePrice = product?.prices.find(
      (item) => item.currency === price.currency
    );
    const expectedPeriod =
      price.interval === PlanIntervals.YEAR ? 'yearly' : 'monthly';
    if (
      !product ||
      product.status !== 'active' ||
      !remotePrice ||
      minorAmount(remotePrice.priceInfo.amount, price.currency) !==
        price.amount ||
      (price.type === PaymentTypes.SUBSCRIPTION &&
        product.billingPeriod !== expectedPeriod) ||
      (price.trialPeriodDays &&
        Number(product?.metadata?.trialDays) !== price.trialPeriodDays)
    ) {
      throw new Error(`Waffo 产品价格或周期与站内配置不一致：${price.priceId}`);
    }
  }

  async handleWebhookEvent(payload: string, signature: string): Promise<void> {
    const event = waffoEventSchema.parse(
      verifyWebhook(payload, signature, { environment: this.environment })
    );
    if (event.storeId !== this.storeId || event.mode !== this.environment) {
      throw new Error(
        `Waffo 回调商店或环境不匹配：${event.storeId}/${event.mode}`
      );
    }
    waffoDate(event.timestamp, '事件时间');
    // 官方控制台的验证事件没有真实订单，不发权益、不写账。
    if (
      event.mode === 'test' &&
      event.data.productName === '[TEST] Webhook Verification' &&
      Number(event.data.amount) === 0
    )
      return;
    const handledEvents = [
      'order.completed',
      'subscription.activated',
      'subscription.payment_succeeded',
      'subscription.renewed',
      'subscription.recovered',
      'subscription.canceling',
      'subscription.uncanceled',
      'subscription.canceled',
      'subscription.past_due',
      'subscription.plan_changed',
      'subscription.plan_change_scheduled',
      'subscription.plan_change_failed',
      'refund.succeeded',
    ];
    if (!handledEvents.includes(event.eventType)) {
      // 退款失败不收回积分；其他未订阅的事件也不改变权益。
      console.info(
        `Waffo 事件无需更改权益：${event.eventType}/${event.eventId}`
      );
      return;
    }
    if (!event.eventId || !event.data?.orderId) {
      throw new Error('Waffo 回调缺少业务事件 ID 或订单 ID');
    }
    const connection = await getDb();
    const notification = await connection.transaction(async (db) => {
      // 同一订单的付款、取消和退款串行处理，避免退款与发积分交叉执行。
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`payment:waffo:${event.data.orderMerchantExternalId || event.data.orderMetadata?.paymentSyncId || event.data.orderId}`}, 0))`
      );
      const syncId =
        event.data.orderMerchantExternalId ||
        event.data.orderMetadata?.paymentSyncId;
      const records = await db
        .select()
        .from(payment)
        .where(
          or(
            eq(payment.subscriptionId, event.data.orderId),
            syncId ? eq(payment.paymentSyncId, syncId) : sql`false`
          )
        );
      const record =
        records.find((item) => item.subscriptionId === event.data.orderId) ||
        records[0];
      if (!record) {
        throw new Error(`找不到 Waffo 站内支付记录：${event.data.orderId}`);
      }
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${record.userId}, 0))`
      );
      if (findPaymentPriceKey(record.priceId)?.provider !== 'waffo') {
        throw new Error(`Waffo 回调关联到其他支付商：${record.priceId}`);
      }
      const order = await this.readOrder(event.data.orderId, record.type);
      if (
        order.testMode !== (this.environment === 'test') ||
        order.metadata?.userId !== record.userId ||
        order.orderMerchantExternalId !== syncId ||
        order.currency !== event.data.currency
      ) {
        throw new Error(`Waffo 订单与站内用户或同步标识不符：${order.id}`);
      }
      if (
        event.eventType === 'subscription.plan_change_scheduled' ||
        event.eventType === 'subscription.plan_change_failed'
      ) {
        // 只同步原订阅的取消续费状态，不为尚未生效或失败的新套餐发权益。
        if (!record.subscriptionId) return;
        const original =
          record.subscriptionId === order.id
            ? order
            : await this.readOrder(record.subscriptionId, record.type);
        if (
          original.metadata?.userId !== record.userId ||
          original.subscriptionProduct?.id !== record.priceId
        )
          throw new Error(`Waffo 原订阅与用户或产品不符：${original.id}`);
        await this.settleOrder(db, record, original, event);
        return;
      }
      const productId =
        order.subscriptionProduct?.id || order.onetimeProduct?.id;
      if (!productId || findPaymentPriceKey(productId)?.provider !== 'waffo') {
        throw new Error(`Waffo 订单产品未配置：${productId}`);
      }
      const currentRecord = await this.recordForOrder(
        db,
        record,
        order,
        productId,
        event
      );
      if (event.eventType === 'refund.succeeded') {
        await this.settleRefund(db, currentRecord, order, event);
        return;
      }
      const shouldNotify = await this.settleOrder(
        db,
        currentRecord,
        order,
        event
      );
      return shouldNotify
        ? {
            record: currentRecord,
            amount: latestSuccessfulPayment(order)?.amount.display,
          }
        : undefined;
    });
    if (notification)
      await this.notify(notification.record, event, notification.amount);
  }

  private async readOrder(orderId: string, type: string): Promise<WaffoOrder> {
    const subscription = type === PaymentTypes.SUBSCRIPTION;
    const field = subscription ? 'subscriptionOrder' : 'onetimeOrder';
    const result = await this.client.graphql.query({
      query: `query($id: String!) {
        ${field}(id: $id) {
          id status testMode currency metadata orderMerchantExternalId
          ${subscription ? 'subscriptionProduct { id } currentPeriodStart currentPeriodEnd' : 'onetimeProduct { id }'}
          payments { id status amount { amount currency display } createdAt periodNumber isFullyRefunded refundStatus
            refunds { id status createdAt pspAmountDetails { amount currency } }
          }
        }
      }`,
      variables: { id: orderId },
    });
    if (result.errors?.length) {
      throw new Error(`Waffo 查询订单失败：${result.errors[0].message}`);
    }
    const orders = z
      .record(z.string(), waffoOrderSchema.nullable())
      .parse(result.data);
    const order = orders[field];
    if (!order) throw new Error(`Waffo 订单不存在：${orderId}`);
    if (order.id !== orderId)
      throw new Error(`Waffo 返回的订单 ID 不符：${order.id}/${orderId}`);
    return order;
  }

  private async recordForOrder(
    db: PaymentTransaction,
    record: PaymentRecord,
    order: WaffoOrder,
    productId: string,
    event: WaffoEvent
  ): Promise<PaymentRecord> {
    if (!record.subscriptionId || record.subscriptionId === order.id) {
      if (record.priceId !== productId) {
        throw new Error(
          `Waffo 订单产品与本地记录不符：${order.id}/${productId}`
        );
      }
      return record;
    }
    if (
      record.type !== PaymentTypes.SUBSCRIPTION ||
      event.eventType !== 'subscription.plan_changed'
    ) {
      throw new Error(`Waffo 订单重复使用同步标识：${order.id}`);
    }
    const price = findConfiguredPriceById(productId);
    if (!price || price.type !== PaymentTypes.SUBSCRIPTION) {
      throw new Error(`Waffo 新订阅套餐未配置：${productId}`);
    }
    // Waffo 换套餐会创建新订单，用订单 ID 作为主键防止重复回调创建多条记录。
    const newRecord = {
      ...record,
      id: `waffo:${order.id}`,
      priceId: productId,
      subscriptionId: order.id,
      sessionId: null,
      invoiceId: null,
      paymentSyncId: null,
      webhookProcessedAt: null,
      interval: price.interval ?? null,
      status: 'incomplete' as const,
      paid: false,
      periodStart: null,
      periodEnd: null,
      cancelAtPeriodEnd: false,
      trialStart: null,
      trialEnd: null,
      createdAt: waffoDate(event.timestamp, '事件时间'),
      updatedAt: new Date(),
    };
    await db
      .insert(payment)
      .values(newRecord)
      .onConflictDoNothing({ target: payment.id });
    await db
      .update(payment)
      .set({
        status: 'canceled',
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })
      .where(eq(payment.id, record.id));
    return newRecord;
  }

  private async settleOrder(
    db: PaymentTransaction,
    record: PaymentRecord,
    order: WaffoOrder,
    event: WaffoEvent
  ): Promise<boolean> {
    const receipt = latestSuccessfulPayment(order);
    const subscription = record.type === PaymentTypes.SUBSCRIPTION;
    const refunded =
      receipt?.isFullyRefunded && receipt.refundStatus === 'refunded';
    const payable =
      receipt &&
      !refunded &&
      ['completed', 'active', 'canceling', 'past_due'].includes(order.status);
    const eventDate = waffoDate(event.timestamp, '事件时间');
    if (event.eventType === 'subscription.payment_succeeded') {
      // 付款事件只记收据。周期和权益由激活、续期、恢复等订阅事件处理。
      if (!event.data.paymentId || event.data.paymentStatus !== 'succeeded') {
        throw new Error(`Waffo 扣款事件缺少成功付款：${event.eventId}`);
      }
      if (receipt?.id === event.data.paymentId) {
        const changed = await db
          .update(payment)
          .set({ invoiceId: receipt.id })
          .where(
            and(
              eq(payment.id, record.id),
              or(
                isNull(payment.invoiceId),
                sql`${payment.invoiceId} <> ${receipt.id}`
              )
            )
          )
          .returning({ id: payment.id });
        return changed.length > 0 && !refunded;
      }
      return false;
    }
    const grants = [
      'order.completed',
      'subscription.activated',
      'subscription.renewed',
      'subscription.recovered',
      'subscription.plan_changed',
      'subscription.canceling',
      'subscription.uncanceled',
    ];
    if (payable && grants.includes(event.eventType)) {
      if (record.scene === PaymentScenes.CREDIT) {
        const key = findPaymentPriceKey(record.priceId)?.key;
        const pack = key
          ? getCreditPackageById(key.replace(/^credits/, '').toLowerCase())
          : undefined;
        if (!pack) throw new Error(`Waffo 积分包未配置：${record.priceId}`);
        if (websiteConfig.credits.enableCredits && pack.amount > 0) {
          await addCredits({
            userId: record.userId,
            amount: pack.amount,
            type: CREDIT_TRANSACTION_TYPE.PURCHASE_PACKAGE,
            description: `Waffo 积分包购买：${pack.id}`,
            paymentId: receipt.id,
            idempotencyKey: `payment:waffo:${receipt.id}`,
            expireDays: pack.expireDays,
            transaction: db,
          });
        }
      } else if (subscription) {
        const grantDate = waffoDate(order.currentPeriodStart, '积分所属周期');
        await addSubscriptionCredits(
          record.userId,
          record.priceId,
          grantDate,
          receipt.id,
          db
        );
      } else {
        await addLifetimeMonthlyCredits(
          record.userId,
          record.priceId,
          waffoDate(receipt.createdAt, '付款时间'),
          receipt.id,
          db
        );
      }
    }
    // 付款通知可能晚于退款通知。以平台上的退款记录补齐处理，不能只依赖到达顺序。
    if (receipt) {
      for (const refund of receipt.refunds.filter(
        (item) => item.status === 'succeeded'
      )) {
        await this.settleRefund(db, record, order, {
          ...event,
          eventType: 'refund.succeeded',
          eventId: refund.id,
          timestamp: refund.createdAt,
          data: {
            ...event.data,
            paymentId: receipt.id,
            refundStatus: 'succeeded',
          },
        });
      }
    }
    const statusMap: Record<string, PaymentStatus> = {
      completed: 'completed',
      active: 'active',
      canceling: 'active',
      past_due: 'past_due',
      pending: 'incomplete',
      canceled: 'canceled',
      closed: 'incomplete_expired',
      expired: 'canceled',
    };
    const status = statusMap[order.status];
    if (!status) throw new Error(`Waffo 订单状态不支持：${order.status}`);
    const changed = await db
      .update(payment)
      .set({
        status: refunded ? 'canceled' : status,
        paid: Boolean(payable),
        subscriptionId: subscription ? order.id : null,
        invoiceId: receipt?.id ?? null,
        periodStart:
          subscription && order.currentPeriodStart
            ? waffoDate(order.currentPeriodStart, '周期开始')
            : null,
        periodEnd:
          subscription && order.currentPeriodEnd
            ? waffoDate(order.currentPeriodEnd, '周期结束')
            : null,
        cancelAtPeriodEnd: order.status === 'canceling',
        webhookProcessedAt: eventDate,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payment.id, record.id),
          or(
            isNull(payment.webhookProcessedAt),
            lte(payment.webhookProcessedAt, eventDate)
          )
        )
      )
      .returning({ id: payment.id });
    return Boolean(
      payable && changed.length && record.invoiceId !== receipt?.id
    );
  }

  private async settleRefund(
    tx: PaymentTransaction,
    record: PaymentRecord,
    order: WaffoOrder,
    event: WaffoEvent
  ): Promise<void> {
    const paymentId = event.data.paymentId;
    if (!paymentId || event.data.refundStatus !== 'succeeded') {
      throw new Error(`Waffo 退款事件缺少付款 ID 或成功状态：${event.eventId}`);
    }
    const refundedReceipt = order.payments.find(
      (receipt) => receipt.id === paymentId && receipt.status === 'succeeded'
    );
    if (!refundedReceipt)
      throw new Error(`Waffo 退款付款不属于此订单：${paymentId}/${order.id}`);
    const currentRefund = refundedReceipt.refunds.find(
      (item) => item.id === event.eventId && item.status === 'succeeded'
    );
    if (
      !currentRefund?.pspAmountDetails ||
      currentRefund.pspAmountDetails.currency !== order.currency
    )
      throw new Error(`Waffo 平台未确认此退款金额或币种：${event.eventId}`);
    const original = minorAmount(
      refundedReceipt.amount.display,
      order.currency
    );
    const refunded = minorAmount(
      currentRefund.pspAmountDetails.amount,
      order.currency
    );
    if (
      refundedReceipt.amount.currency !== order.currency ||
      String(original) !== refundedReceipt.amount.amount
    )
      throw new Error(`Waffo 原始付款金额与币种不一致：${paymentId}`);
    if (original <= 0 || refunded <= 0 || refunded > original) {
      throw new Error(`Waffo 退款金额无效：${event.eventId}`);
    }
    const refunds = refundedReceipt.refunds;
    const totalRefunded = refunds
      .filter((item) => item.status === 'succeeded')
      .reduce((sum, item) => {
        if (
          !item.pspAmountDetails ||
          item.pspAmountDetails.currency !== event.data.currency
        )
          throw new Error(`Waffo 退款明细缺少实际金额或币种不符：${paymentId}`);
        return (
          sum + minorAmount(item.pspAmountDetails.amount, event.data.currency)
        );
      }, 0);
    const fullRefund = totalRefunded >= original;
    const latest = latestSuccessfulPayment(order);
    const affectsAccess =
      fullRefund &&
      (record.type === PaymentTypes.ONE_TIME || latest?.id === paymentId);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${record.userId}, 0))`
    );
    const refundKey = `refund:waffo:${event.eventId}`;
    const duplicates = await tx
      .select({ id: creditTransaction.id })
      .from(creditTransaction)
      .where(eq(creditTransaction.idempotencyKey, refundKey))
      .limit(1);
    if (duplicates.length) return;
    const creditPaymentId = paymentId;
    const grants = await tx
      .select()
      .from(creditTransaction)
      .where(
        and(
          eq(creditTransaction.userId, record.userId),
          eq(creditTransaction.paymentId, creditPaymentId),
          sql`${creditTransaction.amount} > 0`
        )
      );
    // 部分退款先于发货时不落零金额防重标记，后续付款回调会按平台退款记录结算。
    if (!fullRefund && !grants.length && !record.webhookProcessedAt) return;
    let reclaimed = 0;
    for (const grant of grants) {
      const remaining = grant.remainingAmount ?? 0;
      const deduction = Math.min(
        remaining,
        fullRefund
          ? remaining
          : Math.floor((grant.amount * refunded) / original)
      );
      if (!deduction) continue;
      await tx
        .update(creditTransaction)
        .set({ remainingAmount: remaining - deduction, updatedAt: new Date() })
        .where(eq(creditTransaction.id, grant.id));
      reclaimed += deduction;
    }
    const balances = await tx
      .select()
      .from(userCredit)
      .where(eq(userCredit.userId, record.userId))
      .limit(2);
    if (
      balances.length > 1 ||
      (reclaimed > 0 &&
        (!balances[0] || balances[0].currentCredits < reclaimed))
    )
      throw new Error(`Waffo 退款积分余额与流水不一致：${record.userId}`);
    if (reclaimed && balances[0])
      await tx
        .update(userCredit)
        .set({
          currentCredits: balances[0].currentCredits - reclaimed,
          updatedAt: new Date(),
        })
        .where(eq(userCredit.id, balances[0].id));
    // 即使积分已经用完，仍保存零金额标记，防止同一次退款反复处理。
    await tx.insert(creditTransaction).values({
      id: randomUUID(),
      userId: record.userId,
      type: CREDIT_TRANSACTION_TYPE.REFUND,
      amount: -reclaimed,
      description: `Waffo 退款 ${order.currency} ${currentRefund.pspAmountDetails.amount}，收回未使用积分 ${reclaimed}`,
      paymentId,
      idempotencyKey: refundKey,
    });
    if (affectsAccess)
      await tx
        .update(payment)
        .set({
          paid: false,
          invoiceId: paymentId,
          status: 'canceled',
          cancelAtPeriodEnd: false,
          webhookProcessedAt: waffoDate(event.timestamp, '事件时间'),
          updatedAt: new Date(),
        })
        .where(eq(payment.id, record.id));
  }

  private async notify(
    record: PaymentRecord,
    event: WaffoEvent,
    chargedAmount?: string
  ): Promise<void> {
    try {
      await sendPaymentNotification({
        sessionId: event.data.paymentId || event.eventId,
        customerId: record.customerId,
        userName: record.userId,
        amount: Number(chargedAmount ?? event.data.chargedAmount ?? 0),
      });
    } catch (error) {
      // 通知失败不撤销已入账付款；积分或数据库失败仍由上层返回失败供支付商重试。
      console.error(`Waffo 付款已入账，通知发送失败：${event.eventId}`, error);
    }
  }
}
