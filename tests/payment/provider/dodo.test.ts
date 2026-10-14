// biome-ignore-all lint/suspicious/noThenProperty: 模拟 Drizzle 可以 await 的查询对象。
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 用内存数据库模拟事务回滚，运行真实积分逻辑；只替换外部支付 API 和数据库驱动。
const fixtures = vi.hoisted(() => {
  type Row = Record<string, any>;
  type Predicate = (row: Row) => boolean;
  const tables = Object.fromEntries(
    ['payment', 'creditTransaction', 'userCredit'].map((name) => [
      name,
      new Proxy(
        { name },
        { get: (target, key) => (key === 'name' ? target.name : String(key)) }
      ),
    ])
  );
  const state: Record<string, Row[]> = {
    payment: [],
    creditTransaction: [],
    userCredit: [],
  };
  const evaluate = (expression: any, row: Row): any => {
    if (!expression || typeof expression !== 'object') return expression;
    if (expression instanceof Date) return expression;
    const values = expression.values.map((value: any) =>
      typeof value === 'string' && value in row ? row[value] : value
    );
    const text = expression.strings.join('?');
    if (text.includes('EXTRACT(MONTH'))
      return new Date(values[0]).getMonth() + 1 === values[1];
    if (text.includes('EXTRACT(YEAR'))
      return new Date(values[0]).getFullYear() === values[1];
    if (text.includes(' > 0')) return values[0] > 0;
    if (text.includes(' <> ')) return values[0] !== values[1];
    if (text.includes(' + ')) return values[0] + values[1];
    if (text === 'false') return false;
    throw new Error(`测试尚未模拟 SQL：${text}`);
  };
  let failPaymentUpdate = false;
  const db: any = {
    execute: vi.fn(async () => undefined),
    transaction: vi.fn(async (callback: any) => {
      const snapshot = structuredClone(state);
      try {
        return await callback(db);
      } catch (error) {
        for (const name of Object.keys(state)) state[name] = snapshot[name];
        throw error;
      }
    }),
    select: (projection?: Row) => {
      let table: any;
      let predicate: Predicate = () => true;
      let count = Number.POSITIVE_INFINITY;
      const result = () =>
        state[table.name]
          .filter(predicate)
          .slice(0, count)
          .map((row) =>
            projection
              ? Object.fromEntries(
                  Object.entries(projection).map(([key, field]) => [
                    key,
                    row[field],
                  ])
                )
              : { ...row }
          );
      const query: any = {
        from: (value: any) => {
          table = value;
          return query;
        },
        where: (value: Predicate) => {
          predicate = value;
          return query;
        },
        orderBy: () => query,
        limit: (value: number) => {
          count = value;
          return query;
        },
        then: (resolve: any, reject: any) =>
          Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
    insert: (table: any) => ({
      values: (row: Row | Row[]) => {
        let conflict: string | undefined;
        let executed = false;
        let inserted: Row[] = [];
        const run = () => {
          if (executed) return inserted;
          executed = true;
          const conflictField = conflict;
          const rows = Array.isArray(row) ? row : [row];
          inserted = rows
            .filter(
              (candidate) =>
                !conflictField ||
                !state[table.name].some(
                  (existing) =>
                    existing[conflictField] === candidate[conflictField]
                )
            )
            .map((candidate) => ({
              createdAt: new Date(),
              updatedAt: new Date(),
              ...candidate,
            }));
          state[table.name].push(...inserted);
          return inserted;
        };
        const query: any = {
          onConflictDoNothing: ({ target }: any) => {
            conflict = target;
            return query;
          },
          returning: () => Promise.resolve(run()),
          then: (resolve: any, reject: any) =>
            Promise.resolve(run()).then(resolve, reject),
        };
        return query;
      },
    }),
    update: (table: any) => ({
      set: (patch: Row) => ({
        where: (predicate: Predicate) => {
          let executed = false;
          let changed: Row[] = [];
          const run = () => {
            if (executed) return changed;
            if (failPaymentUpdate && table.name === 'payment')
              throw new Error('模拟付款状态写入失败');
            executed = true;
            changed = state[table.name].filter(predicate);
            for (const row of changed)
              for (const [key, value] of Object.entries(patch))
                row[key] = evaluate(value, row);
            return changed;
          };
          return {
            returning: () => Promise.resolve(run()),
            then: (resolve: any, reject: any) =>
              Promise.resolve(run()).then(resolve, reject),
          };
        },
      }),
    }),
  };
  const prices: Row[] = [
    {
      priceId: 'PROD_month',
      type: 'subscription',
      interval: 'month',
      amount: 990,
      currency: 'USD',
    },
    {
      priceId: 'PROD_year',
      type: 'subscription',
      interval: 'year',
      amount: 9900,
      currency: 'USD',
    },
    {
      priceId: 'PROD_lifetime',
      type: 'one_time',
      amount: 19900,
      currency: 'USD',
    },
  ];
  const plans: Row[] = [
    {
      id: 'pro',
      isFree: false,
      isLifetime: false,
      prices: prices.slice(0, 2),
      credits: { enable: true, amount: 1000, expireDays: 30 },
    },
    {
      id: 'lifetime',
      isFree: false,
      isLifetime: true,
      prices: prices.slice(2),
      credits: { enable: true, amount: 1000, expireDays: 30 },
    },
  ];
  const pack: Row = {
    id: 'basic',
    amount: 100,
    price: { priceId: 'PROD_basic', amount: 990, currency: 'USD' },
    expireDays: 30,
  };
  const config = {
    payment: { provider: 'dodo' },
    credits: {
      enableCredits: true,
      registerGiftCredits: { enable: true, amount: 50 },
      packages: { basic: pack },
    },
  };
  const retrievePayment = vi.fn();
  const listPayments = vi.fn();
  const retrieveSubscription = vi.fn();
  const retrieveRefund = vi.fn();
  const retrieveProduct = vi.fn();
  const portal = vi.fn();
  const sdkOptions: any[] = [];
  const webhookKey = `whsec_${Buffer.from('仅用于 Dodo 自动化测试的签名密钥').toString('base64')}`;
  const createSession = vi.fn();
  const cancelSubscription = vi.fn();
  const notify = vi.fn();
  return {
    tables,
    state,
    evaluate,
    db,
    prices,
    plans,
    pack,
    config,
    retrievePayment,
    listPayments,
    retrieveSubscription,
    retrieveRefund,
    retrieveProduct,
    portal,
    sdkOptions,
    webhookKey,
    createSession,
    cancelSubscription,
    notify,
    setFailPaymentUpdate: (value: boolean) => {
      failPaymentUpdate = value;
    },
  };
});

// 模板通用支付用例单独开启订阅/赠送夹具，本站禁止自动发积分由 purchase-only.test.ts 验证。
vi.mock('@/credits/policy', () => ({ automaticCreditGrantsEnabled: true, purchasedCreditValidityMonths: 12 }));
vi.mock('@/db/schema', () => fixtures.tables);
vi.mock('@/db', () => ({ getDb: async () => fixtures.db }));
vi.mock('drizzle-orm', () => ({
  eq: (field: string, value: any) => (row: any) => row[field] === value,
  and:
    (...conditions: any[]) =>
    (row: any) =>
      conditions.every((condition) =>
        typeof condition === 'function'
          ? condition(row)
          : fixtures.evaluate(condition, row)
      ),
  or:
    (...conditions: any[]) =>
    (row: any) =>
      conditions.some((condition) =>
        typeof condition === 'function'
          ? condition(row)
          : fixtures.evaluate(condition, row)
      ),
  isNull: (field: string) => (row: any) => row[field] == null,
  inArray: (field: string, values: any[]) => (row: any) =>
    values.includes(row[field]),
  lte: (field: string, value: any) => (row: any) => row[field] <= value,
  gt: (field: string, value: any) => (row: any) => row[field] > value,
  lt: (field: string, value: any) => (row: any) => row[field] < value,
  not: (condition: any) => (row: any) => !condition(row),
  asc: vi.fn(),
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({
    strings: [...strings],
    values,
  }),
}));
vi.mock('@/config/website', () => ({
  websiteConfig: fixtures.config,
  findPaymentPriceKey: (id: string) => {
    const key = (
      {
        PROD_month: 'proMonthly',
        PROD_year: 'proYearly',
        PROD_lifetime: 'lifetime',
        PROD_basic: 'creditsBasic',
      } as Record<string, string>
    )[id];
    return key ? { provider: 'dodo', key } : null;
  },
}));
vi.mock('@/lib/price-plan', () => ({
  findPlanByPlanId: (id: string) =>
    fixtures.plans.find((plan) => plan.id === id),
  findPlanByPriceId: (id: string) =>
    fixtures.plans.find((plan) =>
      plan.prices.some((price: any) => price.priceId === id)
    ),
  findConfiguredPriceById: (id: string) =>
    fixtures.prices.find((price) => price.priceId === id),
  getAllPricePlans: () => fixtures.plans,
}));
vi.mock('@/notification', () => ({ sendPaymentNotification: fixtures.notify }));

vi.mock('dodopayments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dodopayments')>();
  return {
    default: class {
      products = { retrieve: fixtures.retrieveProduct };
      checkoutSessions = { create: fixtures.createSession };
      payments = {
        retrieve: fixtures.retrievePayment,
        list: fixtures.listPayments,
      };
      subscriptions = {
        retrieve: fixtures.retrieveSubscription,
        update: fixtures.cancelSubscription,
      };
      refunds = { retrieve: fixtures.retrieveRefund };
      customers = { customerPortal: { create: fixtures.portal } };
      webhooks;
      constructor(options: any) {
        fixtures.sdkOptions.push(options);
        // 只模拟远端 API，验签实际调用官方 SDK。
        this.webhooks = new actual.default(options).webhooks;
      }
    },
  };
});

import { DodoProvider } from '@/payment/provider/dodo';
import {
  createCustomerPortal,
  getPaymentProvider,
  handleWebhookEvent,
} from '@/payment';
import { POST } from '@/app/api/webhooks/dodo/route';
import { addCredits, consumeCredits } from '@/credits/credits';

type Row = Record<string, any>;

function seed(scene = 'subscription'): Row {
  const record = {
    id: 'sync-1',
    paymentSyncId: 'sync-1',
    userId: 'user-1',
    customerId: 'dodo:user-1',
    priceId:
      scene === 'credit'
        ? 'PROD_basic'
        : scene === 'lifetime'
          ? 'PROD_lifetime'
          : 'PROD_month',
    type: scene === 'subscription' ? 'subscription' : 'one_time',
    scene,
    interval: scene === 'subscription' ? 'month' : null,
    status: 'incomplete',
    paid: false,
    sessionId: 'SESSION_1',
    subscriptionId: null,
    invoiceId: null,
    webhookProcessedAt: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-04-01'),
  };
  fixtures.state.payment.push(record);
  return record;
}

function paymentReceipt(scene = 'subscription'): Row {
  return {
    payment_id: 'pay_1',
    status: 'succeeded',
    business_id: 'bus_1',
    currency: 'USD',
    total_amount: scene === 'lifetime' ? 19900 : 990,
    created_at: '2026-04-01T12:00:00Z',
    checkout_session_id: 'SESSION_1',
    customer: { customer_id: 'cus_1', email: 'buyer@example.com' },
    metadata: {
      userId: 'user-1',
      paymentSyncId: 'sync-1',
      priceId:
        scene === 'credit'
          ? 'PROD_basic'
          : scene === 'lifetime'
            ? 'PROD_lifetime'
            : 'PROD_month',
    },
    subscription_id: scene === 'subscription' ? 'sub_1' : null,
    is_multi_subscription: false,
    is_update_payment_method: false,
    product_cart:
      scene === 'subscription'
        ? null
        : [
            {
              product_id: scene === 'credit' ? 'PROD_basic' : 'PROD_lifetime',
              quantity: 1,
            },
          ],
    refunds: [],
    refund_status: null,
  };
}

function subscriptionRecord(): Row {
  return {
    subscription_id: 'sub_1',
    status: 'active',
    product_id: 'PROD_month',
    currency: 'USD',
    quantity: 1,
    on_demand: false,
    payment_frequency_count: 1,
    payment_frequency_interval: 'Month',
    previous_billing_date: '2026-04-01T12:00:00Z',
    next_billing_date: '2026-05-01T12:00:00Z',
    created_at: '2026-04-01T12:00:00Z',
    cancel_at_next_billing_date: false,
    trial_period_days: 0,
    customer: { customer_id: 'cus_1', email: 'buyer@example.com' },
    metadata: {
      userId: 'user-1',
      paymentSyncId: 'sync-1',
      priceId: 'PROD_month',
    },
  };
}

function remote(receipt: Row, subscription?: Row) {
  const receipts: Row[] = [receipt];
  fixtures.retrievePayment.mockImplementation(async (id: string) => {
    const found = receipts.find((item) => item.payment_id === id);
    if (!found) throw new Error(`找不到模拟付款：${id}`);
    return structuredClone(found);
  });
  fixtures.listPayments.mockImplementation((query: Row) => ({
    async *[Symbol.asyncIterator]() {
      for (const item of receipts.filter(
        (item) =>
          item.subscription_id === query.subscription_id &&
          item.status === query.status
      ))
        yield structuredClone(item);
    },
  }));
  fixtures.retrieveSubscription.mockImplementation(async () =>
    structuredClone(subscription)
  );
  fixtures.cancelSubscription.mockImplementation(
    async (id: string, patch: Row) => {
      if (!subscription || subscription.subscription_id !== id)
        throw new Error('模拟订阅不符');
      Object.assign(subscription, patch);
      return structuredClone(subscription);
    }
  );
  fixtures.retrieveRefund.mockImplementation(async (id: string) =>
    structuredClone(
      receipts
        .flatMap((item) => item.refunds)
        .find((item) => item.refund_id === id)
    )
  );
  return receipts;
}

function event(type = 'payment.succeeded', ids: Row = {}) {
  return {
    business_id: 'bus_1',
    timestamp: new Date().toISOString(),
    type,
    data: { payment_id: 'pay_1', subscription_id: 'sub_1', ...ids },
  };
}

function signed(payload: string) {
  const id = 'delivery-1';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHmac(
    'sha256',
    Buffer.from(fixtures.webhookKey.slice(6), 'base64')
  )
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  return new Headers({
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${digest}`,
  });
}

async function deliver(provider: DodoProvider, notification = event()) {
  const payload = JSON.stringify(notification);
  const headers = signed(payload);
  return provider.handleWebhookEvent(
    payload,
    headers.get('webhook-signature')!,
    headers
  );
}

function refund(receipt: Row, amount = receipt.total_amount, id = 'ref_1') {
  const row = {
    refund_id: id,
    payment_id: receipt.payment_id,
    business_id: 'bus_1',
    amount,
    currency: receipt.currency,
    status: 'succeeded',
    created_at: new Date().toISOString(),
    is_partial: amount < receipt.total_amount,
  };
  receipt.refunds.push(row);
  const total = receipt.refunds
    .filter((item: Row) => item.status === 'succeeded')
    .reduce((sum: number, item: Row) => sum + item.amount, 0);
  receipt.refund_status = total >= receipt.total_amount ? 'full' : 'partial';
  return event('refund.succeeded', {
    refund_id: id,
    payment_id: receipt.payment_id,
    subscription_id: receipt.subscription_id ?? undefined,
  });
}

const balance = () => fixtures.state.userCredit[0]?.currentCredits ?? 0;
const current = () => fixtures.state.payment[0];
const grants = () =>
  fixtures.state.creditTransaction.filter((row) => row.amount > 0);
const refunds = () =>
  fixtures.state.creditTransaction.filter((row) => row.type === 'REFUND');
const checkoutParams = () => ({
  planId: 'pro',
  priceId: 'PROD_month',
  customerEmail: 'buyer@example.com',
  successUrl:
    'https://example.com/settings/billing?payment=syncing&syncId=sync-1',
  cancelUrl: 'https://example.com/pricing',
  metadata: { userId: 'user-1', paymentSyncId: 'sync-1', userName: '测试用户' },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-02T15:00:00Z'));
  vi.stubEnv('DODO_PAYMENTS_API_KEY', '仅用于模拟 API 的测试值');
  vi.stubEnv('DODO_PAYMENTS_WEBHOOK_KEY', fixtures.webhookKey);
  vi.stubEnv('DODO_DEBUG', 'true');
  fixtures.sdkOptions.length = 0;
  for (const name of Object.keys(fixtures.state)) fixtures.state[name] = [];
  fixtures.config.credits.enableCredits = true;
  fixtures.config.payment.provider = 'dodo';
  fixtures.pack.amount = 100;
  delete fixtures.pack.disabled;
  fixtures.setFailPaymentUpdate(false);
  for (const plan of fixtures.plans) {
    plan.credits.enable = true;
    plan.credits.amount = 1000;
    delete plan.disabled;
  }
  for (const price of fixtures.prices) {
    delete price.disabled;
    delete price.trialPeriodDays;
  }
  fixtures.notify.mockResolvedValue(undefined);
  fixtures.portal.mockResolvedValue({
    link: 'https://test.dodopayments.com/portal/session',
  });
  fixtures.createSession.mockResolvedValue({
    session_id: 'SESSION_1',
    checkout_url: 'https://test.checkout.dodopayments.com/session',
  });
  fixtures.retrieveProduct.mockResolvedValue({
    product_id: 'PROD_month',
    is_recurring: true,
    price: {
      type: 'recurring_price',
      currency: 'USD',
      price: 990,
      payment_frequency_count: 1,
      payment_frequency_interval: 'Month',
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('Dodo 工厂接口和结账', () => {
  it('选择测试环境，创建待付款记录并传递回跳同步标识', async () => {
    const provider = new DodoProvider();
    const result = await provider.createCheckout(checkoutParams());
    expect(provider.getProviderName()).toBe('dodo');
    expect(fixtures.sdkOptions[0].environment).toBe('test_mode');
    expect(result.id).toBe('SESSION_1');
    expect(current()).toMatchObject({
      paid: false,
      status: 'incomplete',
      scene: 'subscription',
      paymentSyncId: 'sync-1',
    });
    expect(fixtures.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        return_url: checkoutParams().successUrl,
        cancel_url: checkoutParams().cancelUrl,
        subscription_data: { trial_period_days: 0 },
        metadata: expect.objectContaining({
          userId: 'user-1',
          paymentSyncId: 'sync-1',
          priceId: 'PROD_month',
        }),
      }),
      { idempotencyKey: 'sync-1' }
    );
    expect(balance()).toBe(0);
  });

  it('生产模式使用生产 API，不改变其他支付商配置', () => {
    vi.stubEnv('DODO_DEBUG', 'false');
    new DodoProvider();
    expect(fixtures.sdkOptions[0].environment).toBe('live_mode');
  });

  it.each([
    'DODO_PAYMENTS_API_KEY',
    'DODO_PAYMENTS_WEBHOOK_KEY',
  ])('缺少 %s 时快速失败', (key) => {
    vi.stubEnv(key, '');
    expect(() => new DodoProvider()).toThrow('缺少');
  });

  it('拒绝站外价格、错误价格和禁用套餐', async () => {
    const provider = new DodoProvider();
    await expect(
      provider.createCheckout({ ...checkoutParams(), priceId: 'unknown' })
    ).rejects.toThrow('无效');
    fixtures.retrieveProduct.mockResolvedValueOnce({
      product_id: 'PROD_month',
      price: { type: 'recurring_price', currency: 'USD', price: 1 },
    });
    await expect(provider.createCheckout(checkoutParams())).rejects.toThrow(
      '不一致'
    );
    fixtures.plans[0].disabled = true;
    await expect(provider.createCheckout(checkoutParams())).rejects.toThrow(
      '无效'
    );
    expect(fixtures.createSession).not.toHaveBeenCalled();
  });

  it('积分包使用同一结账接口，禁止可自定金额产品', async () => {
    const provider = new DodoProvider();
    fixtures.retrieveProduct.mockResolvedValue({
      product_id: 'PROD_basic',
      price: { type: 'one_time_price', currency: 'USD', price: 990 },
    });
    await provider.createCreditCheckout({
      ...checkoutParams(),
      packageId: 'basic',
      priceId: 'PROD_basic',
    });
    expect(current()).toMatchObject({ scene: 'credit', type: 'one_time' });
    expect(
      fixtures.createSession.mock.calls[0][0].subscription_data
    ).toBeUndefined();
    fixtures.retrieveProduct.mockResolvedValue({
      product_id: 'PROD_basic',
      price: {
        type: 'one_time_price',
        currency: 'USD',
        price: 990,
        pay_what_you_want: true,
      },
    });
    await expect(
      provider.createCreditCheckout({
        ...checkoutParams(),
        packageId: 'basic',
        priceId: 'PROD_basic',
      })
    ).rejects.toThrow('不一致');
  });

  it('积分开关关闭不能购买积分包', async () => {
    fixtures.config.credits.enableCredits = false;
    await expect(
      new DodoProvider().createCreditCheckout({
        ...checkoutParams(),
        packageId: 'basic',
        priceId: 'PROD_basic',
      })
    ).rejects.toThrow('无效');
  });

  it('客户门户支持原客户和返回账单页', async () => {
    const result = await new DodoProvider().createCustomerPortal({
      customerId: 'cus_1',
      returnUrl: 'https://example.com/settings/billing',
    });
    expect(result.url).toContain('/portal/');
    expect(fixtures.portal).toHaveBeenCalledWith('cus_1', {
      return_url: 'https://example.com/settings/billing',
      send_email: false,
    });
  });
});

describe('Dodo 真实 SDK 验签', () => {
  it('拒绝伪造签名、缺少签名头和篡改正文', async () => {
    const provider = new DodoProvider();
    const payload = JSON.stringify(event());
    const headers = signed(payload);
    await expect(
      provider.handleWebhookEvent(payload, 'v1,invalid', headers)
    ).rejects.toThrow();
    await expect(provider.handleWebhookEvent(payload, 'valid')).rejects.toThrow(
      '缺少'
    );
    await expect(
      provider.handleWebhookEvent(
        payload.replace('bus_1', 'bus_other'),
        headers.get('webhook-signature')!,
        headers
      )
    ).rejects.toThrow();
    expect(fixtures.db.transaction).not.toHaveBeenCalled();
  });

  it('过期签名不能重放', async () => {
    const provider = new DodoProvider();
    const payload = JSON.stringify(event());
    const headers = signed(payload);
    vi.setSystemTime(new Date(Date.now() + 10 * 60 * 1000));
    await expect(
      provider.handleWebhookEvent(
        payload,
        headers.get('webhook-signature')!,
        headers
      )
    ).rejects.toThrow();
  });
});

describe('Dodo 付款、权益和积分', () => {
  it('真实一次性付款中的空订阅ID可以入账，重放不重复发积分', async () => {
    seed('credit');
    remote(paymentReceipt('credit'));
    const provider = new DodoProvider();
    const notification = event('payment.succeeded', { subscription_id: null });
    await deliver(provider, notification);
    await deliver(provider, notification);
    expect(balance()).toBe(100);
    expect(grants()).toHaveLength(1);
  });
  it.each([
    'subscription.active',
    'payment.succeeded',
  ])('首个通知为 %s 均只发一次订阅积分', async (first) => {
    seed();
    remote(paymentReceipt(), subscriptionRecord());
    const provider = new DodoProvider();
    await deliver(provider, event(first));
    await deliver(
      provider,
      event(
        first === 'subscription.active'
          ? 'payment.succeeded'
          : 'subscription.active'
      )
    );
    await deliver(provider);
    expect(balance()).toBe(1000);
    expect(grants()).toHaveLength(1);
    expect(grants()[0]).toMatchObject({
      type: 'SUBSCRIPTION_RENEWAL',
      paymentId: 'pay_1',
    });
    expect(current()).toMatchObject({
      paid: true,
      status: 'active',
      subscriptionId: 'sub_1',
      invoiceId: 'pay_1',
      customerId: 'cus_1',
    });
    expect(current().webhookProcessedAt).toBeInstanceOf(Date);
  });

  it.each([
    'credit',
    'lifetime',
  ])('%s 一次性支付重复通知不会重复发积分', async (scene) => {
    seed(scene);
    remote(paymentReceipt(scene));
    const provider = new DodoProvider();
    await deliver(
      provider,
      event('payment.succeeded', { subscription_id: undefined })
    );
    await deliver(
      provider,
      event('payment.succeeded', { subscription_id: undefined })
    );
    expect(balance()).toBe(scene === 'credit' ? 100 : 1000);
    expect(grants()).toHaveLength(1);
    expect(current()).toMatchObject({
      paid: true,
      status: 'completed',
      subscriptionId: null,
    });
  });

  it('年付首次只发月度额度，不一次发十二个月', async () => {
    seed().priceId = 'PROD_year';
    const receipt = paymentReceipt();
    receipt.total_amount = 9900;
    const subscription = subscriptionRecord();
    subscription.product_id = 'PROD_year';
    subscription.payment_frequency_interval = 'Year';
    subscription.next_billing_date = '2027-04-01T12:00:00Z';
    remote(receipt, subscription);
    await deliver(new DodoProvider());
    expect(balance()).toBe(1000);
    expect(current().interval).toBe('year');
  });

  it('新账期续费发新月份积分，迟到通知不把账期和收据倒退', async () => {
    seed();
    const receipt = paymentReceipt();
    const subscription = subscriptionRecord();
    const receipts = remote(receipt, subscription);
    const provider = new DodoProvider();
    await deliver(provider);
    vi.setSystemTime(new Date('2026-05-02T15:00:00Z'));
    const next = {
      ...structuredClone(receipt),
      payment_id: 'pay_2',
      created_at: '2026-05-01T12:00:00Z',
    };
    receipts.push(next);
    subscription.previous_billing_date = '2026-05-01T12:00:00Z';
    subscription.next_billing_date = '2026-06-01T12:00:00Z';
    await deliver(provider, event('subscription.renewed'));
    expect(balance()).toBe(1000);
    await deliver(provider);
    expect(balance()).toBe(1000);
    expect(current().invoiceId).toBe('pay_2');
    expect(current().periodEnd.toISOString()).toBe('2026-06-01T12:00:00.000Z');
  });

  it.each([
    'failed',
    'cancelled',
    'processing',
  ])('付款 %s 不发积分和开通权益', async (status) => {
    seed('credit');
    const receipt = paymentReceipt('credit');
    receipt.status = status;
    remote(receipt);
    await deliver(
      new DodoProvider(),
      event(`payment.${status}`, { subscription_id: undefined })
    );
    expect(balance()).toBe(0);
    expect(current().paid).toBe(false);
  });

  it.each([
    'on_hold',
    'past_due',
    'paused',
    'cancelled',
    'expired',
    'failed',
  ])('同步订阅 %s 状态但不增加积分', async (status) => {
    seed();
    const subscription = subscriptionRecord();
    remote(paymentReceipt(), subscription);
    const provider = new DodoProvider();
    await deliver(provider);
    subscription.status = status;
    await deliver(provider, event(`subscription.${status}`));
    expect(balance()).toBe(1000);
    expect(current().status).toBe(
      (
        {
          on_hold: 'past_due',
          cancelled: 'canceled',
          expired: 'canceled',
        } as Row
      )[status] ?? status
    );
  });

  it('普通期末取消保留当期权益且不扣积分', async () => {
    seed();
    const subscription = subscriptionRecord();
    remote(paymentReceipt(), subscription);
    const provider = new DodoProvider();
    await deliver(provider);
    subscription.cancel_at_next_billing_date = true;
    await deliver(provider, event('subscription.updated'));
    expect(balance()).toBe(1000);
    expect(current()).toMatchObject({
      status: 'active',
      paid: true,
      cancelAtPeriodEnd: true,
    });
    expect(fixtures.cancelSubscription).not.toHaveBeenCalled();
  });

  it.each([
    'global',
    'plan',
    'zero',
  ])('尊重 %s 积分配置，付款仍然入账', async (flag) => {
    seed();
    remote(paymentReceipt(), subscriptionRecord());
    if (flag === 'global') fixtures.config.credits.enableCredits = false;
    if (flag === 'plan') fixtures.plans[0].credits.enable = false;
    if (flag === 'zero') fixtures.plans[0].credits.amount = 0;
    await deliver(new DodoProvider());
    expect(balance()).toBe(0);
    expect(current().paid).toBe(true);
  });

  it('试用期的零元授权不发购买积分', async () => {
    seed();
    const subscription = subscriptionRecord();
    subscription.trial_period_days = 7;
    const receipt = paymentReceipt();
    receipt.total_amount = 0;
    remote(receipt, subscription);
    await deliver(new DodoProvider(), event('subscription.active'));
    expect(balance()).toBe(0);
    expect(current()).toMatchObject({ status: 'trialing', paid: true });
    expect(current().trialEnd).toBeInstanceOf(Date);
  });

  it('更新支付方式的授权付款不覆盖原收据或发积分', async () => {
    seed();
    const receipt = paymentReceipt();
    receipt.is_update_payment_method = true;
    remote(receipt, subscriptionRecord());
    await deliver(new DodoProvider());
    expect(grants()).toHaveLength(0);
    expect(current().invoiceId).toBeNull();
  });

  it('已终止订阅的迟到付款通知不新发积分或重新开通', async () => {
    seed();
    const subscription = subscriptionRecord();
    subscription.status = 'cancelled';
    remote(paymentReceipt(), subscription);
    await deliver(new DodoProvider());
    expect(balance()).toBe(0);
    expect(current()).toMatchObject({ paid: false, status: 'canceled' });
  });

  it('处理中和等待激活不能提前结束付款回跳同步', async () => {
    seed();
    const receipt = paymentReceipt();
    const subscription = subscriptionRecord();
    receipt.status = 'processing';
    subscription.status = 'pending';
    remote(receipt, subscription);
    const provider = new DodoProvider();
    await deliver(provider, event('payment.processing'));
    expect(current().webhookProcessedAt).toBeNull();
    receipt.status = 'succeeded';
    await deliver(provider);
    expect(current().webhookProcessedAt).toBeNull();
    expect(balance()).toBe(0);
    subscription.status = 'active';
    await deliver(provider, event('subscription.active'));
    expect(current().webhookProcessedAt).toBeInstanceOf(Date);
    expect(balance()).toBe(1000);
  });

  it('数据库写入失败时付款、余额和流水一起回滚，重试只发一次', async () => {
    seed();
    remote(paymentReceipt(), subscriptionRecord());
    const provider = new DodoProvider();
    fixtures.setFailPaymentUpdate(true);
    await expect(deliver(provider)).rejects.toThrow('模拟付款状态写入失败');
    expect(balance()).toBe(0);
    expect(grants()).toHaveLength(0);
    expect(current().paid).toBe(false);
    fixtures.setFailPaymentUpdate(false);
    await deliver(provider);
    await deliver(provider);
    expect(balance()).toBe(1000);
  });

  it('内部消息发送失败不撤销已入账付款', async () => {
    seed();
    remote(paymentReceipt(), subscriptionRecord());
    fixtures.notify.mockRejectedValue(new Error('模拟通知不可用'));
    await deliver(new DodoProvider());
    expect(balance()).toBe(1000);
    expect(current().paid).toBe(true);
  });

  it('已存在订阅可同步已配置的新套餐', async () => {
    seed();
    const subscription = subscriptionRecord();
    remote(paymentReceipt(), subscription);
    const provider = new DodoProvider();
    await deliver(provider);
    subscription.product_id = 'PROD_year';
    subscription.payment_frequency_interval = 'Year';
    subscription.next_billing_date = '2027-04-01T12:00:00Z';
    await deliver(provider, event('subscription.plan_changed'));
    expect(current()).toMatchObject({ priceId: 'PROD_year', interval: 'year' });
    expect(balance()).toBe(1000);
  });
});

describe('Dodo 退款与统一积分事务', () => {
  it.each([
    'credit',
    'lifetime',
    'subscription',
  ])('%s 全额退款只回收原付款剩余额度，重复通知不多扣', async (scene) => {
    seed(scene);
    const receipt = paymentReceipt(scene);
    const subscription =
      scene === 'subscription' ? subscriptionRecord() : undefined;
    remote(receipt, subscription);
    const provider = new DodoProvider();
    await deliver(
      provider,
      event('payment.succeeded', {
        subscription_id: subscription?.subscription_id,
      })
    );
    const amount = balance();
    await consumeCredits({
      userId: 'user-1',
      amount: 10,
      description: '测试消耗',
    });
    await addCredits({
      userId: 'user-1',
      amount: 50,
      type: 'REGISTER_GIFT',
      description: '测试赠送',
      idempotencyKey: 'gift:user-1',
    });
    const notification = refund(receipt);
    await deliver(provider, notification);
    await deliver(provider, notification);
    expect(balance()).toBe(50);
    expect(refunds()).toHaveLength(1);
    expect(refunds()[0].amount).toBe(-(amount - 10));
    expect(current()).toMatchObject({ status: 'canceled', paid: false });
    expect(fixtures.cancelSubscription).toHaveBeenCalledTimes(
      scene === 'subscription' ? 1 : 0
    );
  });

  it('部分退款按比例收回积分并停止续费，保留当期权益', async () => {
    seed();
    const receipt = paymentReceipt();
    const subscription = subscriptionRecord();
    remote(receipt, subscription);
    const provider = new DodoProvider();
    await deliver(provider);
    await deliver(provider, refund(receipt, 495));
    expect(balance()).toBe(500);
    expect(current()).toMatchObject({
      status: 'active',
      paid: true,
      cancelAtPeriodEnd: true,
    });
    expect(subscription.cancel_at_next_billing_date).toBe(true);
  });

  it('多次部分退款累计全退收回全部余额', async () => {
    seed();
    const receipt = paymentReceipt();
    remote(receipt, subscriptionRecord());
    const provider = new DodoProvider();
    await deliver(provider);
    await deliver(provider, refund(receipt, 495));
    await deliver(provider, refund(receipt, 495, 'ref_2'));
    expect(balance()).toBe(0);
    expect(refunds()).toHaveLength(2);
    expect(current().paid).toBe(false);
  });

  it('取消平台订阅失败后仍可重试，已扣积分不重复扣', async () => {
    seed();
    const receipt = paymentReceipt();
    remote(receipt, subscriptionRecord());
    const provider = new DodoProvider();
    await deliver(provider);
    const notification = refund(receipt, 495);
    fixtures.cancelSubscription.mockRejectedValueOnce(
      new Error('模拟远端取消失败')
    );
    await expect(deliver(provider, notification)).rejects.toThrow(
      '模拟远端取消失败'
    );
    expect(balance()).toBe(500);
    await deliver(provider, notification);
    expect(balance()).toBe(500);
    expect(refunds()).toHaveLength(1);
    expect(current().cancelAtPeriodEnd).toBe(true);
    expect(fixtures.cancelSubscription).toHaveBeenCalledTimes(2);
  });

  it('退款先到、付款成功通知后到，不重新发积分或开通权益', async () => {
    seed();
    const receipt = paymentReceipt();
    remote(receipt, subscriptionRecord());
    const provider = new DodoProvider();
    await deliver(provider, refund(receipt));
    await deliver(provider);
    await deliver(provider, event('subscription.active'));
    expect(balance()).toBe(0);
    expect(grants()).toHaveLength(0);
    expect(current().paid).toBe(false);
  });

  it('退款通知丢失时从成功付款查询结果补齐退款并停止续费', async () => {
    seed();
    const receipt = paymentReceipt();
    const subscription = subscriptionRecord();
    remote(receipt, subscription);
    const provider = new DodoProvider();
    await deliver(provider);
    refund(receipt, 495);
    await deliver(provider, event('subscription.updated'));
    expect(balance()).toBe(500);
    expect(subscription.cancel_at_next_billing_date).toBe(true);
  });

  it('历史账期退款不撤销最新账期，但仍停止续费', async () => {
    seed();
    const receipt = paymentReceipt();
    const subscription = subscriptionRecord();
    const receipts = remote(receipt, subscription);
    const provider = new DodoProvider();
    await deliver(provider);
    vi.setSystemTime(new Date('2026-05-02T15:00:00Z'));
    receipts.push({
      ...structuredClone(receipt),
      payment_id: 'pay_2',
      created_at: '2026-05-01T12:00:00Z',
    });
    subscription.previous_billing_date = '2026-05-01T12:00:00Z';
    subscription.next_billing_date = '2026-06-01T12:00:00Z';
    await deliver(provider, event('subscription.renewed'));
    await deliver(provider, refund(receipt));
    expect(balance()).toBe(1000);
    expect(current()).toMatchObject({
      status: 'active',
      paid: true,
      invoiceId: 'pay_2',
      cancelAtPeriodEnd: true,
    });
  });

  it('退款写入后的数据库错误回滚余额、流水和权益', async () => {
    seed();
    const receipt = paymentReceipt();
    remote(receipt, subscriptionRecord());
    const provider = new DodoProvider();
    await deliver(provider);
    const notification = refund(receipt);
    fixtures.setFailPaymentUpdate(true);
    await expect(deliver(provider, notification)).rejects.toThrow(
      '模拟付款状态写入失败'
    );
    expect(balance()).toBe(1000);
    expect(refunds()).toHaveLength(0);
    expect(current().paid).toBe(true);
  });

  it.each([
    'refund.failed',
    'credit.added',
    'dispute.opened',
  ])('%s 不改变本地权益', async (type) => {
    seed();
    await deliver(new DodoProvider(), event(type));
    expect(fixtures.db.transaction).not.toHaveBeenCalled();
    expect(balance()).toBe(0);
  });

  it('平台查询仍未成功的退款不能撤销积分', async () => {
    seed();
    const receipt = paymentReceipt();
    remote(receipt, subscriptionRecord());
    const provider = new DodoProvider();
    await deliver(provider);
    const notification = refund(receipt);
    receipt.refunds[0].status = 'pending';
    await expect(deliver(provider, notification)).rejects.toThrow('未确认');
    expect(balance()).toBe(1000);
  });
});

describe('Dodo 工厂和 Webhook 路由', () => {
  it('通过原工厂选择 Dodo，不增加其他业务入口', () => {
    expect(getPaymentProvider().getProviderName()).toBe('dodo');
  });

  it('切换默认支付商后原 Dodo 回调和客户门户仍由 Dodo 处理', async () => {
    seed();
    remote(paymentReceipt(), subscriptionRecord());
    fixtures.config.payment.provider = 'stripe';
    const payload = JSON.stringify(event());
    const headers = signed(payload);
    await handleWebhookEvent(
      payload,
      headers.get('webhook-signature')!,
      'dodo',
      headers
    );
    expect(balance()).toBe(1000);
    await createCustomerPortal({ customerId: 'cus_1' }, 'dodo');
    expect(fixtures.portal).toHaveBeenCalledWith('cus_1', expect.anything());
  });

  it('路由缺少签名头返回 400', async () => {
    const request = new Request('https://example.com/api/webhooks/dodo', {
      method: 'POST',
      body: '{}',
    });
    const response = await POST(request as Parameters<typeof POST>[0]);
    expect(response.status).toBe(400);
  });

  it('路由业务写入成功返回 200，数据库失败返回 500 允许重试', async () => {
    seed();
    remote(paymentReceipt(), subscriptionRecord());
    const payload = JSON.stringify(event());
    const request = () =>
      new Request('https://example.com/api/webhooks/dodo', {
        method: 'POST',
        body: payload,
        headers: signed(payload),
      }) as Parameters<typeof POST>[0];
    fixtures.setFailPaymentUpdate(true);
    expect((await POST(request())).status).toBe(500);
    expect(balance()).toBe(0);
    fixtures.setFailPaymentUpdate(false);
    expect((await POST(request())).status).toBe(200);
    expect(balance()).toBe(1000);
  });

  it('实际 website 配置包含 Dodo 全部七个产品并支持跨支付商反查', async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_PROVIDER', 'dodo');
    vi.stubEnv('NEXT_PUBLIC_DODO_PRODUCT_PRO_MONTHLY', 'pdt_dodo_month');
    vi.stubEnv('NEXT_PUBLIC_DODO_PRODUCT_PRO_YEARLY', 'pdt_dodo_year');
    vi.stubEnv('NEXT_PUBLIC_DODO_PRODUCT_LIFETIME', 'pdt_dodo_lifetime');
    vi.stubEnv('NEXT_PUBLIC_DODO_PRODUCT_CREDITS_BASIC', 'pdt_dodo_basic');
    vi.stubEnv(
      'NEXT_PUBLIC_DODO_PRODUCT_CREDITS_STANDARD',
      'pdt_dodo_standard'
    );
    vi.stubEnv('NEXT_PUBLIC_DODO_PRODUCT_CREDITS_PREMIUM', 'pdt_dodo_premium');
    vi.stubEnv(
      'NEXT_PUBLIC_DODO_PRODUCT_CREDITS_ENTERPRISE',
      'pdt_dodo_enterprise'
    );
    vi.stubEnv('NEXT_PUBLIC_WAFFO_PRODUCT_PRO_MONTHLY', 'PROD_old_waffo');
    const actual =
      await vi.importActual<typeof import('@/config/website')>(
        '@/config/website'
      );
    expect(actual.websiteConfig.payment.provider).toBe('dodo');
    expect(
      actual.websiteConfig.price.plans.pro.prices.map((price) => price.priceId)
    ).toEqual(['pdt_dodo_month', 'pdt_dodo_year']);
    expect(actual.websiteConfig.price.plans.lifetime.prices[0].priceId).toBe(
      'pdt_dodo_lifetime'
    );
    for (const name of ['basic', 'standard', 'premium', 'enterprise'])
      expect(actual.websiteConfig.credits.packages[name].price.priceId).toBe(
        `pdt_dodo_${name}`
      );
    expect(actual.findPaymentPriceKey('PROD_old_waffo')).toEqual({
      provider: 'waffo',
      key: 'proMonthly',
    });
  });
});

describe('Dodo 订单边界校验', () => {
  it.each([
    'business',
    'user',
    'product',
    'currency',
    'quantity',
    'session',
  ])('拒绝 %s 不匹配的一次性订单', async (field) => {
    seed('credit');
    const receipt = paymentReceipt('credit');
    if (field === 'business') receipt.business_id = 'bus_other';
    if (field === 'user') receipt.metadata.userId = 'another-user';
    if (field === 'product') receipt.product_cart[0].product_id = 'unknown';
    if (field === 'currency') receipt.currency = 'EUR';
    if (field === 'quantity') receipt.product_cart[0].quantity = 2;
    if (field === 'session') receipt.checkout_session_id = 'other-session';
    remote(receipt);
    await expect(
      deliver(
        new DodoProvider(),
        event('payment.succeeded', { subscription_id: undefined })
      )
    ).rejects.toThrow();
    expect(balance()).toBe(0);
  });

  it('没有站内订单不能发积分', async () => {
    remote(paymentReceipt(), subscriptionRecord());
    await expect(deliver(new DodoProvider())).rejects.toThrow('找不到');
    expect(balance()).toBe(0);
  });
});
