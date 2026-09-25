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
import { payment } from '@/db/schema';
import { findConfiguredPriceById, findPlanByPlanId } from '@/lib/price-plan';
import { sendPaymentNotification } from '@/notification';
import { eq } from 'drizzle-orm';
import {
  type CheckoutResult,
  type CreateCheckoutParams,
  type CreateCreditCheckoutParams,
  type PaymentProvider,
  PaymentScenes,
  type PaymentScene,
  type PaymentType,
  PaymentTypes,
  type PlanInterval,
  type PortalResult,
} from '../types';

interface PaypalLink {
  rel: string;
  href: string;
}
interface PaypalMoney {
  currency_code: string;
  value: string;
}
interface PaypalOrder {
  id: string;
  status: string;
  links?: PaypalLink[];
  payer?: { payer_id?: string };
  purchase_units?: Array<{
    custom_id?: string;
    payments?: {
      captures?: Array<{ id: string; status: string; amount: PaypalMoney }>;
    };
  }>;
}
interface PaypalSubscription {
  id: string;
  plan_id: string;
  status: string;
  subscriber?: { payer_id?: string };
  billing_info?: {
    next_billing_time?: string;
    last_payment?: { time?: string; amount?: PaypalMoney };
  };
  links?: PaypalLink[];
}
interface PaypalPlan {
  id: string;
  billing_cycles?: Array<{
    tenure_type: string;
    frequency: { interval_unit: string; interval_count: number };
    pricing_scheme?: { fixed_price?: PaypalMoney };
  }>;
}
interface PaypalWebhookEvent {
  id: string;
  event_type: string;
  resource: {
    id?: string;
    billing_agreement_id?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
}

function approvalUrl(links: PaypalLink[] | undefined): string {
  const url = links?.find((link) =>
    ['approve', 'payer-action'].includes(link.rel)
  )?.href;
  if (!url) throw new Error('PayPal 未返回支付审批链接');
  return url;
}

class PaypalApi {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  readonly webhookId: string;
  readonly sandbox: boolean;

  constructor() {
    this.clientId = process.env.PAYPAL_CLIENT_ID ?? '';
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET ?? '';
    this.webhookId = process.env.PAYPAL_WEBHOOK_ID ?? '';
    this.sandbox = process.env.PAYPAL_SANDBOX !== 'false';
    if (!this.clientId || !this.clientSecret || !this.webhookId) {
      throw new Error(
        '缺少 PAYPAL_CLIENT_ID、PAYPAL_CLIENT_SECRET 或 PAYPAL_WEBHOOK_ID'
      );
    }
    this.baseUrl = this.sandbox
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';
  }

  private async accessToken(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      cache: 'no-store',
    });
    if (!response.ok)
      throw new Error(`PayPal 获取访问令牌失败：${response.status}`);
    const result = (await response.json()) as { access_token?: string };
    if (!result.access_token) throw new Error('PayPal 未返回访问令牌');
    return result.access_token;
  }

  async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    requestId?: string
  ): Promise<T> {
    const token = await this.accessToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`PayPal ${method} ${path} 失败：${response.status}`);
    }
    return (await response.json()) as T;
  }

  getOrder(id: string): Promise<PaypalOrder> {
    return this.request('GET', `/v2/checkout/orders/${encodeURIComponent(id)}`);
  }

  captureOrder(id: string): Promise<PaypalOrder> {
    return this.request(
      'POST',
      `/v2/checkout/orders/${encodeURIComponent(id)}/capture`,
      {},
      `capture-${id}`
    );
  }

  getSubscription(id: string): Promise<PaypalSubscription> {
    return this.request(
      'GET',
      `/v1/billing/subscriptions/${encodeURIComponent(id)}`
    );
  }

  getPlan(id: string): Promise<PaypalPlan> {
    return this.request('GET', `/v1/billing/plans/${encodeURIComponent(id)}`);
  }

  async verifyWebhook(
    event: PaypalWebhookEvent,
    headers: Headers
  ): Promise<void> {
    const names = [
      'paypal-auth-algo',
      'paypal-cert-url',
      'paypal-transmission-id',
      'paypal-transmission-sig',
      'paypal-transmission-time',
    ];
    if (names.some((name) => !headers.get(name))) {
      throw new Error('PayPal Webhook 缺少验签请求头');
    }
    const result = await this.request<{ verification_status: string }>(
      'POST',
      '/v1/notifications/verify-webhook-signature',
      {
        auth_algo: headers.get('paypal-auth-algo'),
        cert_url: headers.get('paypal-cert-url'),
        transmission_id: headers.get('paypal-transmission-id'),
        transmission_sig: headers.get('paypal-transmission-sig'),
        transmission_time: headers.get('paypal-transmission-time'),
        webhook_id: this.webhookId,
        webhook_event: event,
      }
    );
    if (result.verification_status !== 'SUCCESS') {
      throw new Error('PayPal Webhook 签名验证失败');
    }
  }
}

async function createPaypalPaymentRecord(input: {
  userId: string;
  priceId: string;
  checkoutId: string;
  paymentSyncId: string;
  type: PaymentType;
  scene: PaymentScene;
  interval?: PlanInterval;
}) {
  const db = await getDb();
  await db.insert(payment).values({
    id: randomUUID(),
    priceId: input.priceId,
    userId: input.userId,
    customerId: 'pending',
    subscriptionId: input.type === 'subscription' ? input.checkoutId : null,
    sessionId: input.checkoutId,
    paymentSyncId: input.paymentSyncId,
    type: input.type,
    scene: input.scene,
    interval: input.interval ?? null,
    status: 'incomplete',
    paid: false,
  });
}

async function findPaypalPaymentByCheckout(checkoutId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(payment)
    .where(eq(payment.sessionId, checkoutId))
    .limit(1);
  return rows[0] ?? null;
}

async function findPaypalPaymentBySubscription(subscriptionId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(payment)
    .where(eq(payment.subscriptionId, subscriptionId))
    .limit(1);
  return rows[0] ?? null;
}

function expectedOrderPurchase(priceId: string, scene: string | null) {
  if (scene === PaymentScenes.LIFETIME) {
    const price = findConfiguredPriceById(priceId);
    if (!price) throw new Error(`未找到 PayPal 终身套餐价格：${priceId}`);
    return {
      amount: price.amount,
      currency: price.currency,
      credits: 0,
      expireDays: undefined,
    };
  }
  if (scene === PaymentScenes.CREDIT) {
    const key = findPaymentPriceKey(priceId)?.key;
    const packageId = key?.replace(/^credits/, '').toLowerCase();
    const creditPackage = packageId
      ? websiteConfig.credits.packages[packageId]
      : undefined;
    if (!creditPackage) throw new Error(`未找到 PayPal 积分包价格：${priceId}`);
    return {
      amount: creditPackage.price.amount,
      currency: creditPackage.price.currency,
      credits: creditPackage.amount,
      expireDays: creditPackage.expireDays,
    };
  }
  throw new Error(`无效的 PayPal 一次性支付场景：${scene}`);
}

async function settlePaypalOrder(order: PaypalOrder): Promise<void> {
  if (order.status !== 'COMPLETED') {
    throw new Error(`PayPal 订单尚未完成：${order.id}/${order.status}`);
  }
  const record = await findPaypalPaymentByCheckout(order.id);
  if (!record || record.type !== 'one_time') {
    throw new Error(`找不到 PayPal 订单记录：${order.id}`);
  }
  if (record.paid) return;

  const unit = order.purchase_units?.[0];
  const capture = unit?.payments?.captures?.find(
    (item) => item.status === 'COMPLETED'
  );
  if (!capture || unit?.custom_id !== record.paymentSyncId) {
    throw new Error(`PayPal 订单缺少有效的支付确认：${order.id}`);
  }
  const expected = expectedOrderPurchase(record.priceId, record.scene);
  if (
    capture.amount.currency_code !== expected.currency ||
    Number(capture.amount.value) * 100 !== expected.amount
  ) {
    throw new Error(`PayPal 支付金额与站内价格不一致：${order.id}`);
  }

  if (record.scene === PaymentScenes.CREDIT) {
    await addCredits({
      userId: record.userId,
      amount: expected.credits,
      type: CREDIT_TRANSACTION_TYPE.PURCHASE_PACKAGE,
      description: `PayPal 积分包购买：${record.priceId}`,
      paymentId: capture.id,
      idempotencyKey: `payment:paypal:${capture.id}`,
      expireDays: expected.expireDays,
    });
  } else if (websiteConfig.credits.enableCredits) {
    await addLifetimeMonthlyCredits(record.userId, record.priceId);
  }

  const db = await getDb();
  await db
    .update(payment)
    .set({
      customerId: order.payer?.payer_id ?? 'paypal',
      invoiceId: capture.id,
      status: 'completed',
      paid: true,
      webhookProcessedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(payment.id, record.id));

  try {
    await sendPaymentNotification({
      sessionId: capture.id,
      customerId: order.payer?.payer_id ?? 'paypal',
      userName: record.userId,
      amount: expected.amount / 100,
    });
  } catch (error) {
    console.error('PayPal 支付已入账，但通知发送失败：', error);
  }
}

async function captureAndSettlePaypalOrder(
  api: PaypalApi,
  orderId: string
): Promise<void> {
  const existing = await findPaypalPaymentByCheckout(orderId);
  if (!existing) throw new Error(`找不到 PayPal 订单记录：${orderId}`);
  if (existing.paid) return;

  const current = await api.getOrder(orderId);
  const order =
    current.status === 'COMPLETED'
      ? current
      : current.status === 'APPROVED'
        ? await api.captureOrder(orderId)
        : null;
  if (!order)
    throw new Error(`PayPal 订单尚未获批：${orderId}/${current.status}`);
  await settlePaypalOrder(order);
}

async function validatePaypalPlan(
  api: PaypalApi,
  planId: string,
  amount: number,
  currency: string,
  interval?: string
): Promise<void> {
  const plan: PaypalPlan = await api.getPlan(planId);
  const regular = plan.billing_cycles?.find(
    (cycle) => cycle.tenure_type === 'REGULAR'
  );
  const price = regular?.pricing_scheme?.fixed_price;
  if (
    plan.id !== planId ||
    regular?.frequency.interval_unit !== interval?.toUpperCase() ||
    regular?.frequency.interval_count !== 1 ||
    price?.currency_code !== currency ||
    Number(price?.value) * 100 !== amount
  ) {
    throw new Error(`PayPal 订阅计划与站内价格不一致：${planId}`);
  }
}

function paymentStatus(status: string) {
  switch (status) {
    case 'ACTIVE':
      return 'active' as const;
    case 'SUSPENDED':
      return 'paused' as const;
    case 'CANCELLED':
    case 'EXPIRED':
      return 'canceled' as const;
    default:
      return 'incomplete' as const;
  }
}

async function syncPaypalSubscription(
  api: PaypalApi,
  subscriptionId: string,
  statusOverride?: 'past_due'
): Promise<void> {
  const record = await findPaypalPaymentBySubscription(subscriptionId);
  if (!record) throw new Error(`找不到 PayPal 订阅记录：${subscriptionId}`);
  const subscription = await api.getSubscription(subscriptionId);
  if (subscription.plan_id !== record.priceId) {
    throw new Error(`PayPal 订阅计划与本地记录不符：${subscriptionId}`);
  }
  const db = await getDb();
  await db
    .update(payment)
    .set({
      customerId: subscription.subscriber?.payer_id ?? record.customerId,
      status: statusOverride ?? paymentStatus(subscription.status),
      periodStart: subscription.billing_info?.last_payment?.time
        ? new Date(subscription.billing_info.last_payment.time)
        : record.periodStart,
      periodEnd: subscription.billing_info?.next_billing_time
        ? new Date(subscription.billing_info.next_billing_time)
        : record.periodEnd,
      updatedAt: new Date(),
    })
    .where(eq(payment.id, record.id));
}

async function settlePaypalSubscriptionSale(
  api: PaypalApi,
  subscriptionId: string,
  saleId: string
): Promise<void> {
  const record = await findPaypalPaymentBySubscription(subscriptionId);
  if (!record) throw new Error(`找不到 PayPal 订阅记录：${subscriptionId}`);
  if (record.invoiceId === saleId) return;
  const subscription: PaypalSubscription =
    await api.getSubscription(subscriptionId);
  if (
    subscription.plan_id !== record.priceId ||
    subscription.status !== 'ACTIVE'
  ) {
    throw new Error(`PayPal 订阅未激活或计划不符：${subscriptionId}`);
  }
  const expected = findConfiguredPriceById(record.priceId);
  const paidAmount = subscription.billing_info?.last_payment?.amount;
  if (
    !expected ||
    !paidAmount ||
    paidAmount.currency_code !== expected.currency ||
    Number(paidAmount.value) * 100 !== expected.amount
  ) {
    throw new Error(`PayPal 订阅扣款金额与站内价格不一致：${subscriptionId}`);
  }

  if (websiteConfig.credits.enableCredits) {
    await addSubscriptionCredits(
      record.userId,
      record.priceId,
      subscription.billing_info?.last_payment?.time
        ? new Date(subscription.billing_info.last_payment.time)
        : new Date()
    );
  }
  const db = await getDb();
  await db
    .update(payment)
    .set({
      customerId: subscription.subscriber?.payer_id ?? record.customerId,
      invoiceId: saleId,
      status: 'active',
      paid: true,
      periodStart: subscription.billing_info?.last_payment?.time
        ? new Date(subscription.billing_info.last_payment.time)
        : new Date(),
      periodEnd: subscription.billing_info?.next_billing_time
        ? new Date(subscription.billing_info.next_billing_time)
        : null,
      cancelAtPeriodEnd: false,
      webhookProcessedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(payment.id, record.id));

  try {
    await sendPaymentNotification({
      sessionId: saleId,
      customerId: subscription.subscriber?.payer_id ?? 'paypal',
      userName: record.userId,
      amount: expected.amount / 100,
    });
  } catch (error) {
    console.error('PayPal 订阅已入账，但通知发送失败：', error);
  }
}

async function handlePaypalWebhook(
  api: PaypalApi,
  payload: string,
  headers: Headers
): Promise<void> {
  const event = JSON.parse(payload) as PaypalWebhookEvent;
  if (!event.id || !event.event_type || !event.resource) {
    throw new Error('PayPal Webhook 缺少事件 ID、类型或资源');
  }
  await api.verifyWebhook(event, headers);

  switch (event.event_type) {
    case 'CHECKOUT.ORDER.APPROVED': {
      const orderId = event.resource.id;
      if (!orderId) throw new Error('PayPal 审批事件缺少订单 ID');
      await captureAndSettlePaypalOrder(api, orderId);
      return;
    }
    case 'PAYMENT.CAPTURE.COMPLETED': {
      const orderId = event.resource.supplementary_data?.related_ids?.order_id;
      if (!orderId) throw new Error('PayPal 扣款事件缺少订单 ID');
      await settlePaypalOrder(await api.getOrder(orderId));
      return;
    }
    case 'PAYMENT.SALE.COMPLETED': {
      const subscriptionId = event.resource.billing_agreement_id;
      const saleId = event.resource.id;
      if (!subscriptionId || !saleId) {
        throw new Error('PayPal 续费事件缺少订阅 ID 或交易 ID');
      }
      await settlePaypalSubscriptionSale(api, subscriptionId, saleId);
      return;
    }
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
    case 'BILLING.SUBSCRIPTION.UPDATED':
    case 'BILLING.SUBSCRIPTION.CANCELLED':
    case 'BILLING.SUBSCRIPTION.EXPIRED':
    case 'BILLING.SUBSCRIPTION.SUSPENDED':
    case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
      const subscriptionId = event.resource.id;
      if (!subscriptionId) throw new Error('PayPal 订阅事件缺少订阅 ID');
      await syncPaypalSubscription(
        api,
        subscriptionId,
        event.event_type === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED'
          ? 'past_due'
          : undefined
      );
      return;
    }
    default:
      return;
  }
}

export class PaypalProvider implements PaymentProvider {
  private readonly api = new PaypalApi();
  getProviderName(): string {
    return 'paypal';
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const plan = findPlanByPlanId(params.planId);
    const price = plan?.prices.find((item) => item.priceId === params.priceId);
    if (!plan || !price || plan.disabled || price.disabled) {
      throw new Error(
        `无效的 PayPal 套餐或价格：${params.planId}/${params.priceId}`
      );
    }
    const userId = params.metadata?.userId;
    const paymentSyncId = params.metadata?.paymentSyncId;
    if (!userId || !paymentSyncId || !params.successUrl || !params.cancelUrl) {
      throw new Error('PayPal 结账缺少用户、同步标识或回跳地址');
    }

    if (price.type === PaymentTypes.SUBSCRIPTION) {
      await validatePaypalPlan(
        this.api,
        price.priceId,
        price.amount,
        price.currency,
        price.interval
      );
      const subscription = await this.api.request<PaypalSubscription>(
        'POST',
        '/v1/billing/subscriptions',
        {
          plan_id: price.priceId,
          custom_id: paymentSyncId,
          subscriber: { email_address: params.customerEmail },
          application_context: {
            return_url: params.successUrl,
            cancel_url: params.cancelUrl,
            user_action: 'SUBSCRIBE_NOW',
          },
        },
        paymentSyncId
      );
      await createPaypalPaymentRecord({
        userId,
        priceId: price.priceId,
        checkoutId: subscription.id,
        paymentSyncId,
        type: PaymentTypes.SUBSCRIPTION,
        scene: PaymentScenes.SUBSCRIPTION,
        interval: price.interval,
      });
      return { url: approvalUrl(subscription.links), id: subscription.id };
    }

    if (!plan.isLifetime)
      throw new Error(`PayPal 不支持此一次性套餐：${params.planId}`);
    return this.createOneTimeOrder({
      userId,
      paymentSyncId,
      priceId: price.priceId,
      amount: price.amount,
      currency: price.currency,
      description: params.planId,
      scene: PaymentScenes.LIFETIME,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
    });
  }

  async createCreditCheckout(
    params: CreateCreditCheckoutParams
  ): Promise<CheckoutResult> {
    const creditPackage = getCreditPackageById(params.packageId);
    if (!creditPackage || creditPackage.price.priceId !== params.priceId) {
      throw new Error(
        `无效的 PayPal 积分包：${params.packageId}/${params.priceId}`
      );
    }
    const userId = params.metadata?.userId;
    const paymentSyncId = params.metadata?.paymentSyncId;
    if (!userId || !paymentSyncId || !params.successUrl || !params.cancelUrl) {
      throw new Error('PayPal 积分结账缺少用户、同步标识或回跳地址');
    }
    return this.createOneTimeOrder({
      userId,
      paymentSyncId,
      priceId: params.priceId,
      amount: creditPackage.price.amount,
      currency: creditPackage.price.currency,
      description: params.packageId,
      scene: PaymentScenes.CREDIT,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
    });
  }

  async createCustomerPortal(): Promise<PortalResult> {
    return {
      url: this.api.sandbox
        ? 'https://www.sandbox.paypal.com/myaccount/autopay'
        : 'https://www.paypal.com/myaccount/autopay',
    };
  }

  async handleWebhookEvent(
    payload: string,
    _signature: string,
    headers?: Headers
  ): Promise<void> {
    if (!headers) throw new Error('PayPal Webhook 缺少请求头');
    await handlePaypalWebhook(this.api, payload, headers);
  }
  private async createOneTimeOrder(input: {
    userId: string;
    paymentSyncId: string;
    priceId: string;
    amount: number;
    currency: string;
    description: string;
    scene: PaymentScenes.CREDIT | PaymentScenes.LIFETIME;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutResult> {
    if (
      input.currency !== 'USD' ||
      !Number.isInteger(input.amount) ||
      input.amount <= 0
    ) {
      throw new Error(
        `PayPal 当前只支持正整数美分价格：${input.currency}/${input.amount}`
      );
    }
    const order = await this.api.request<PaypalOrder>(
      'POST',
      '/v2/checkout/orders',
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.description,
            custom_id: input.paymentSyncId,
            amount: {
              currency_code: input.currency,
              value: (input.amount / 100).toFixed(2),
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: input.successUrl,
              cancel_url: input.cancelUrl,
              shipping_preference: 'NO_SHIPPING',
              user_action: 'PAY_NOW',
            },
          },
        },
      },
      input.paymentSyncId
    );
    await createPaypalPaymentRecord({
      userId: input.userId,
      priceId: input.priceId,
      checkoutId: order.id,
      paymentSyncId: input.paymentSyncId,
      type: PaymentTypes.ONE_TIME,
      scene: input.scene,
    });
    return { url: approvalUrl(order.links), id: order.id };
  }
}
