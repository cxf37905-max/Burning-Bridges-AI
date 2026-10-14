// biome-ignore-all lint/suspicious/noThenProperty: 模拟 Drizzle 可以 await 的查询对象。
import { generateKeyPairSync, sign } from 'node:crypto';
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
    credits: {
      enableCredits: true,
      registerGiftCredits: { enable: true, amount: 50 },
      packages: { basic: pack },
    },
  };
  const graphql = vi.fn();
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
    graphql,
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
    return key ? { provider: 'waffo', key } : null;
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
vi.mock('@waffo/pancake-ts', () => ({
  WaffoPancake: class {
    graphql = { query: fixtures.graphql };
    checkout = { createSession: fixtures.createSession };
    orders = { cancelSubscription: fixtures.cancelSubscription };
  },
  verifyWebhook: (payload: string, signature: string) => {
    if (signature !== 'valid') throw new Error('无效签名');
    return JSON.parse(payload);
  },
}));

import { WaffoProvider } from '@/payment/provider/waffo';
import { addCredits, addRegisterGiftCredits } from '@/credits/credits';
import {
  batchAddLifetimeMonthlyCredits,
  batchAddYearlyUsersMonthlyCredits,
} from '@/credits/distribute';

function seedPayment(scene = 'subscription'): Record<string, any> {
  const record = {
    id: 'sync-1',
    paymentSyncId: 'sync-1',
    userId: 'user-1',
    customerId: 'waffo:user-1',
    priceId:
      scene === 'credit'
        ? 'PROD_basic'
        : scene === 'lifetime'
          ? 'PROD_lifetime'
          : 'PROD_month',
    type: scene === 'subscription' ? 'subscription' : 'one_time',
    scene,
    status: 'incomplete',
    paid: false,
    webhookProcessedAt: null,
    subscriptionId: null,
    invoiceId: null,
    createdAt: new Date('2026-04-01'),
  };
  fixtures.state.payment.push(record);
  return record;
}

function remoteOrder(scene = 'subscription'): Record<string, any> {
  return {
    id: 'ORD_1',
    status: scene === 'subscription' ? 'active' : 'completed',
    testMode: true,
    currency: 'USD',
    metadata: { userId: 'user-1', paymentSyncId: 'sync-1' },
    orderMerchantExternalId: 'sync-1',
    ...(scene === 'subscription'
      ? {
          subscriptionProduct: { id: 'PROD_month' },
          currentPeriodStart: '2026-04-01',
          currentPeriodEnd: '2026-05-01',
        }
      : {
          onetimeProduct: {
            id: scene === 'credit' ? 'PROD_basic' : 'PROD_lifetime',
          },
        }),
    payments: [
      {
        id: 'PAY_1',
        status: 'succeeded',
        createdAt: '2026-04-01T12:00:00Z',
        periodNumber: 1,
        amount: { amount: '990', currency: 'USD', display: '9.90' },
        isFullyRefunded: false,
        refundStatus: 'none',
        refunds: [] as any[],
      },
    ],
  };
}

function webhook(
  type = 'subscription.activated',
  data: Record<string, any> = {},
  timestamp = '2026-04-01T12:00:00Z'
): Record<string, any> {
  return {
    eventType: type,
    eventId: type.startsWith('refund') ? 'REF_1' : type,
    storeId: 'STO_1',
    mode: 'test',
    timestamp,
    data: {
      orderId: 'ORD_1',
      currency: 'USD',
      orderMerchantExternalId: 'sync-1',
      currentPeriodStart: '2026-04-01',
      ...data,
    },
  };
}

function mockOrder(order: ReturnType<typeof remoteOrder>) {
  fixtures.cancelSubscription.mockImplementation(async ({ orderId }: any) => {
    order.status = 'canceling';
    return { orderId, status: 'canceling' };
  });
  fixtures.graphql.mockImplementation(async ({ query }: any) => ({
    data: {
      [query.includes('subscriptionOrder(')
        ? 'subscriptionOrder'
        : 'onetimeOrder']: order,
    },
  }));
}

async function deliver(
  provider: WaffoProvider,
  event: ReturnType<typeof webhook>
) {
  return provider.handleWebhookEvent(JSON.stringify(event), 'valid');
}

function refund(
  order: ReturnType<typeof remoteOrder>,
  amount = '9.90',
  id = 'REF_1'
) {
  order.payments[0].refunds.push({
    id,
    status: 'succeeded',
    createdAt: '2026-04-02T12:00:00Z',
    pspAmountDetails: { amount, currency: 'USD' },
  });
  if (amount === '9.90') order.payments[0].isFullyRefunded = true;
  order.payments[0].refundStatus = 'refunded';
  return webhook(
    'refund.succeeded',
    { paymentId: 'PAY_1', refundStatus: 'succeeded' },
    '2026-04-02T12:00:00Z'
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-02T15:00:00Z'));
  vi.stubEnv('WAFFO_MERCHANT_ID', 'MER_1');
  vi.stubEnv('WAFFO_PRIVATE_KEY', '测试私钥由模拟 SDK 接收');
  vi.stubEnv('WAFFO_STORE_ID', 'STO_1');
  vi.stubEnv('WAFFO_DEBUG', 'true');
  for (const table of Object.keys(fixtures.state)) fixtures.state[table] = [];
  fixtures.config.credits.enableCredits = true;
  fixtures.pack.amount = 100;
  fixtures.setFailPaymentUpdate(false);
  for (const plan of fixtures.plans) {
    plan.credits.enable = true;
    plan.credits.amount = 1000;
  }
  for (const price of fixtures.prices) delete price.trialPeriodDays;
  fixtures.notify.mockResolvedValue(undefined);
  fixtures.createSession.mockResolvedValue({
    sessionId: 'SESSION_1',
    checkoutUrl: 'https://pancake.waffo.ai/store/test/checkout/SESSION_1',
  });
  fixtures.graphql.mockResolvedValue({
    data: {
      subscriptionProducts: [
        {
          id: 'PROD_month',
          status: 'active',
          billingPeriod: 'monthly',
          prices: [{ currency: 'USD', priceInfo: { amount: '9.90' } }],
        },
      ],
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('Waffo 结账与工厂接口', () => {
  const params = {
    planId: 'pro',
    priceId: 'PROD_month',
    customerEmail: 'buyer@example.com',
    successUrl: 'https://example.com/settings/billing?syncId=sync-1',
    metadata: { userId: 'user-1', paymentSyncId: 'sync-1' },
  };
  it('使用产品 ID 创建结账并保留站内同步标识', async () => {
    const result = await new WaffoProvider().createCheckout(params);
    expect(result.id).toBe('SESSION_1');
    expect(result.url).toContain('test=true');
    expect(fixtures.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'PROD_month',
        withTrial: false,
        orderMerchantExternalId: 'sync-1',
        metadata: expect.objectContaining({
          userId: 'user-1',
          scene: 'subscription',
        }),
      }),
      { idempotencyKey: 'sync-1' }
    );
    expect(fixtures.state.payment[0]).toMatchObject({
      paid: false,
      paymentSyncId: 'sync-1',
      sessionId: 'SESSION_1',
    });
  });
  it('拒绝 HTTP 回跳地址', async () => {
    await expect(
      new WaffoProvider().createCheckout({
        ...params,
        successUrl: 'http://localhost:3000',
      })
    ).rejects.toThrow('HTTPS');
    expect(fixtures.createSession).not.toHaveBeenCalled();
  });
  it('后台价格不一致时禁止收款', async () => {
    fixtures.graphql.mockResolvedValue({
      data: {
        subscriptionProducts: [
          {
            id: 'PROD_month',
            status: 'active',
            billingPeriod: 'monthly',
            prices: [{ currency: 'USD', priceInfo: { amount: '19.90' } }],
          },
        ],
      },
    });
    await expect(new WaffoProvider().createCheckout(params)).rejects.toThrow(
      '不一致'
    );
    expect(fixtures.createSession).not.toHaveBeenCalled();
  });
  it('试用天数不一致时禁止意外开通试用', async () => {
    fixtures.prices[0].trialPeriodDays = 7;
    await expect(new WaffoProvider().createCheckout(params)).rejects.toThrow(
      '不一致'
    );
  });
  it('凭据缺失时快速失败', () => {
    vi.stubEnv('WAFFO_PRIVATE_KEY', '');
    expect(() => new WaffoProvider()).toThrow('WAFFO_PRIVATE_KEY');
  });
  it('账单入口使用官方购买邮箱门户', async () => {
    expect(await new WaffoProvider().createCustomerPortal()).toEqual({
      url: 'https://pancake.waffo.ai/consumer/portal/login',
    });
  });
});

describe('Waffo 支付与积分回调', () => {
  it.each([
    ['subscription.payment_succeeded', 'subscription.activated'],
    ['subscription.activated', 'subscription.payment_succeeded'],
  ])('首付通知按 %s → %s 到达仅发一份积分', async (first, second) => {
    seedPayment();
    mockOrder(remoteOrder());
    const provider = new WaffoProvider();
    for (const type of [first, second, first, second])
      await deliver(
        provider,
        webhook(type, { paymentId: 'PAY_1', paymentStatus: 'succeeded' })
      );
    expect(
      fixtures.state.creditTransaction.filter((row) => row.amount > 0)
    ).toHaveLength(1);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(1000);
    expect(fixtures.state.payment[0]).toMatchObject({
      paid: true,
      status: 'active',
      subscriptionId: 'ORD_1',
      invoiceId: 'PAY_1',
    });
  });
  it('取消通知比激活通知先到也不漏发首月积分', async () => {
    seedPayment();
    const order = remoteOrder();
    order.status = 'canceling';
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(
      provider,
      webhook('subscription.canceling', {}, '2026-04-02T12:00:00Z')
    );
    await deliver(provider, webhook());
    expect(fixtures.state.userCredit[0].currentCredits).toBe(1000);
    expect(fixtures.state.payment[0]).toMatchObject({
      status: 'active',
      cancelAtPeriodEnd: true,
    });
  });
  it('积分包重复付款通知不重复增加余额', async () => {
    seedPayment('credit');
    mockOrder(remoteOrder('credit'));
    const provider = new WaffoProvider();
    await deliver(provider, webhook('order.completed'));
    await deliver(provider, webhook('order.completed'));
    expect(fixtures.state.userCredit[0].currentCredits).toBe(100);
    expect(fixtures.state.creditTransaction[0].idempotencyKey).toBe(
      'payment:waffo:PAY_1'
    );
  });
  it('终身套餐使用既有月度防重键', async () => {
    seedPayment('lifetime');
    mockOrder(remoteOrder('lifetime'));
    const provider = new WaffoProvider();
    await deliver(provider, webhook('order.completed'));
    await deliver(provider, webhook('order.completed'));
    expect(fixtures.state.creditTransaction[0].type).toBe('LIFETIME_MONTHLY');
    expect(fixtures.state.userCredit[0].currentCredits).toBe(1000);
  });
  it.each([
    'subscription',
    'credit',
    'lifetime',
  ])('全局关闭积分时 %s 只入账、不发积分', async (scene) => {
    seedPayment(scene);
    mockOrder(remoteOrder(scene));
    fixtures.config.credits.enableCredits = false;
    await deliver(
      new WaffoProvider(),
      webhook(
        scene === 'subscription' ? 'subscription.activated' : 'order.completed'
      )
    );
    expect(fixtures.state.creditTransaction).toHaveLength(0);
    expect(fixtures.state.payment[0].paid).toBe(true);
  });
  it('单独关闭套餐积分不影响付费状态', async () => {
    seedPayment();
    mockOrder(remoteOrder());
    fixtures.plans[0].credits.enable = false;
    await deliver(new WaffoProvider(), webhook());
    expect(fixtures.state.creditTransaction).toHaveLength(0);
    expect(fixtures.state.payment[0].paid).toBe(true);
  });
  it('收据通知不提前完成页面同步', async () => {
    seedPayment();
    mockOrder(remoteOrder());
    await deliver(
      new WaffoProvider(),
      webhook('subscription.payment_succeeded', {
        paymentId: 'PAY_1',
        paymentStatus: 'succeeded',
      })
    );
    expect(fixtures.state.payment[0].webhookProcessedAt).toBeNull();
    expect(fixtures.state.payment[0].paid).toBe(false);
  });
  it('下一月续期可再发积分，重试不能重复发', async () => {
    seedPayment();
    const order = remoteOrder();
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    vi.setSystemTime(new Date('2026-05-02T15:00:00Z'));
    order.currentPeriodStart = '2026-05-01';
    order.currentPeriodEnd = '2026-06-01';
    order.payments.push({
      ...order.payments[0],
      id: 'PAY_2',
      createdAt: '2026-05-01T12:00:00Z',
      periodNumber: 2,
    });
    const renewal = webhook(
      'subscription.renewed',
      { currentPeriodStart: '2026-05-01' },
      '2026-05-01T12:00:00Z'
    );
    await deliver(provider, renewal);
    await deliver(provider, renewal);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(1000);
    expect(fixtures.state.creditTransaction).toHaveLength(3);
  });
  it('取消续费保留本期权益，最终取消撤销权益', async () => {
    seedPayment();
    const order = remoteOrder();
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    order.status = 'canceling';
    await deliver(
      provider,
      webhook('subscription.canceling', {}, '2026-04-02T12:00:00Z')
    );
    expect(fixtures.state.payment[0]).toMatchObject({
      paid: true,
      status: 'active',
      cancelAtPeriodEnd: true,
    });
    order.status = 'canceled';
    await deliver(
      provider,
      webhook('subscription.canceled', {}, '2026-05-01T12:00:00Z')
    );
    expect(fixtures.state.payment[0]).toMatchObject({
      paid: false,
      status: 'canceled',
    });
    expect(fixtures.state.userCredit[0].currentCredits).toBe(1000);
  });
  it('迟到的激活通知不能重新打开已经取消的套餐', async () => {
    const record = seedPayment();
    record.status = 'canceled';
    record.webhookProcessedAt = new Date('2026-05-01');
    const order = remoteOrder();
    order.status = 'canceled';
    mockOrder(order);
    await deliver(new WaffoProvider(), webhook());
    expect(fixtures.state.payment[0]).toMatchObject({
      paid: false,
      status: 'canceled',
    });
    expect(fixtures.state.creditTransaction).toHaveLength(0);
  });
  it('付款状态写入失败时积分和余额一起回滚，重试后正常入账', async () => {
    seedPayment('credit');
    mockOrder(remoteOrder('credit'));
    const provider = new WaffoProvider();
    fixtures.setFailPaymentUpdate(true);
    await expect(deliver(provider, webhook('order.completed'))).rejects.toThrow(
      '写入失败'
    );
    expect(fixtures.state.creditTransaction).toHaveLength(0);
    expect(fixtures.state.userCredit).toHaveLength(0);
    fixtures.setFailPaymentUpdate(false);
    await deliver(provider, webhook('order.completed'));
    expect(fixtures.state.userCredit[0].currentCredits).toBe(100);
  });
  it.each([
    'refund.failed',
    'subscription.plan_change_scheduled',
    'subscription.plan_change_failed',
  ])('%s 不提前发放或撤销权益', async (type) => {
    seedPayment();
    mockOrder(remoteOrder());
    await deliver(new WaffoProvider(), webhook(type));
    expect(fixtures.state.payment[0].status).toBe('incomplete');
    expect(fixtures.state.creditTransaction).toHaveLength(0);
  });
  it('商店不匹配拒绝回调', async () => {
    const event = webhook();
    event.storeId = 'STO_other';
    await expect(deliver(new WaffoProvider(), event)).rejects.toThrow('不匹配');
    expect(fixtures.db.transaction).not.toHaveBeenCalled();
  });
  it('签名不正确不能执行数据库逻辑', async () => {
    await expect(
      new WaffoProvider().handleWebhookEvent(
        JSON.stringify(webhook()),
        'invalid'
      )
    ).rejects.toThrow('无效签名');
    expect(fixtures.db.transaction).not.toHaveBeenCalled();
  });
  it('平台订单用户不匹配不能给其他账号发权益', async () => {
    seedPayment();
    const order = remoteOrder();
    order.metadata.userId = 'attacker';
    mockOrder(order);
    await expect(deliver(new WaffoProvider(), webhook())).rejects.toThrow(
      '不符'
    );
    expect(fixtures.state.creditTransaction).toHaveLength(0);
  });
});

describe('Waffo 退款', () => {
  it.each([
    '9.90',
    '4.95',
  ])('订阅退款 %s 都调用平台取消续费，重复通知不重复扣积分或取消', async (amount) => {
    seedPayment();
    const order = remoteOrder();
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    const event = refund(order, amount);
    await deliver(provider, event);
    await deliver(provider, event);
    expect(fixtures.cancelSubscription).toHaveBeenCalledExactlyOnceWith({
      orderId: 'ORD_1',
    });
    expect(fixtures.state.userCredit[0].currentCredits).toBe(
      amount === '9.90' ? 0 : 500
    );
    expect(
      fixtures.state.creditTransaction.filter((row) => row.type === 'REFUND')
    ).toHaveLength(1);
    expect(fixtures.state.payment[0].cancelAtPeriodEnd).toBe(amount !== '9.90');
    expect(order.status).toBe('canceling');
  });
  it('取消接口失败时退款已记账，重试仍补做取消且不重复扣积分', async () => {
    seedPayment();
    const order = remoteOrder();
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    const event = refund(order, '4.95');
    fixtures.cancelSubscription.mockRejectedValueOnce(
      new Error('平台取消暂时失败')
    );
    await expect(deliver(provider, event)).rejects.toThrow('平台取消暂时失败');
    expect(fixtures.state.userCredit[0].currentCredits).toBe(500);
    expect(fixtures.state.payment[0].cancelAtPeriodEnd).not.toBe(true);
    await deliver(provider, event);
    expect(fixtures.cancelSubscription).toHaveBeenCalledTimes(2);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(500);
    expect(
      fixtures.state.creditTransaction.filter((row) => row.type === 'REFUND')
    ).toHaveLength(1);
    expect(fixtures.state.payment[0].cancelAtPeriodEnd).toBe(true);
  });
  it('平台已受理但响应丢失时，重试读到取消中，不再次调用取消', async () => {
    seedPayment();
    const order = remoteOrder();
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    const event = refund(order, '4.95');
    fixtures.cancelSubscription.mockImplementationOnce(async () => {
      order.status = 'canceling';
      throw new Error('响应超时');
    });
    await expect(deliver(provider, event)).rejects.toThrow('响应超时');
    await deliver(provider, event);
    expect(fixtures.cancelSubscription).toHaveBeenCalledTimes(1);
    expect(fixtures.state.payment[0].cancelAtPeriodEnd).toBe(true);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(500);
  });
  it('平台取消成功但本地同步失败，重试补齐状态且不重复扣积分', async () => {
    seedPayment();
    const order = remoteOrder();
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    const event = refund(order, '4.95');
    fixtures.setFailPaymentUpdate(true);
    await expect(deliver(provider, event)).rejects.toThrow('付款状态写入失败');
    expect(order.status).toBe('canceling');
    fixtures.setFailPaymentUpdate(false);
    await deliver(provider, event);
    expect(fixtures.cancelSubscription).toHaveBeenCalledTimes(1);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(500);
    expect(fixtures.state.payment[0].cancelAtPeriodEnd).toBe(true);
  });
  it('退款失败不取消订阅，也不扣积分', async () => {
    seedPayment();
    const order = remoteOrder();
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    await deliver(
      provider,
      webhook('refund.failed', { paymentId: 'PAY_1', refundStatus: 'failed' })
    );
    expect(fixtures.cancelSubscription).not.toHaveBeenCalled();
    expect(fixtures.state.userCredit[0].currentCredits).toBe(1000);
    expect(fixtures.state.payment[0].paid).toBe(true);
  });
  it('订阅部分退款先于发积分，也先取消续费，随后到账不漏扣退款积分', async () => {
    seedPayment();
    const order = remoteOrder();
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, refund(order, '4.95'));
    expect(fixtures.cancelSubscription).toHaveBeenCalledTimes(1);
    await deliver(provider, webhook());
    expect(fixtures.state.userCredit[0].currentCredits).toBe(500);
    expect(fixtures.state.payment[0].cancelAtPeriodEnd).toBe(true);
    expect(fixtures.cancelSubscription).toHaveBeenCalledTimes(1);
  });
  it('未收到退款事件时，付款回调查询到退款也补做取消', async () => {
    seedPayment();
    const order = remoteOrder();
    refund(order, '4.95');
    mockOrder(order);
    await deliver(new WaffoProvider(), webhook());
    expect(fixtures.cancelSubscription).toHaveBeenCalledExactlyOnceWith({
      orderId: 'ORD_1',
    });
    expect(fixtures.state.payment[0].cancelAtPeriodEnd).toBe(true);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(500);
  });
  it('订阅已终止时退款不再次调用取消，且不恢复付费权益', async () => {
    seedPayment();
    const order = remoteOrder();
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    order.status = 'canceled';
    await deliver(provider, refund(order, '4.95'));
    expect(fixtures.cancelSubscription).not.toHaveBeenCalled();
    expect(fixtures.state.payment[0]).toMatchObject({
      paid: false,
      status: 'canceled',
      cancelAtPeriodEnd: false,
    });
  });
  it('取消返回终止状态时同步本地权益，取消请求发生在退款事务提交后', async () => {
    seedPayment();
    const order = remoteOrder();
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    order.status = 'past_due';
    fixtures.cancelSubscription.mockImplementationOnce(
      async ({ orderId }: any) => {
        expect(
          fixtures.state.creditTransaction.some((row) => row.type === 'REFUND')
        ).toBe(true);
        order.status = 'canceled';
        return { orderId, status: 'canceled' };
      }
    );
    await deliver(provider, refund(order, '4.95'));
    expect(fixtures.state.payment[0]).toMatchObject({
      paid: false,
      status: 'canceled',
      cancelAtPeriodEnd: false,
    });
    expect(fixtures.state.userCredit[0].currentCredits).toBe(500);
  });
  it('取消响应订单不符时返回失败，不将本地标记成已停止续费', async () => {
    seedPayment();
    const order = remoteOrder();
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    fixtures.cancelSubscription.mockResolvedValueOnce({
      orderId: 'ORD_other',
      status: 'canceling',
    });
    await expect(deliver(provider, refund(order, '4.95'))).rejects.toThrow(
      '返回订单不符'
    );
    expect(fixtures.state.payment[0].cancelAtPeriodEnd).not.toBe(true);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(500);
  });
  it('取消期间终止回调已落库时，本地同步不重新标记为待取消', async () => {
    seedPayment();
    const order = remoteOrder();
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    fixtures.cancelSubscription.mockImplementationOnce(
      async ({ orderId }: any) => {
        Object.assign(fixtures.state.payment[0], {
          paid: false,
          status: 'canceled',
          cancelAtPeriodEnd: false,
        });
        return { orderId, status: 'canceling' };
      }
    );
    await deliver(provider, refund(order, '4.95'));
    expect(fixtures.state.payment[0]).toMatchObject({
      paid: false,
      status: 'canceled',
      cancelAtPeriodEnd: false,
    });
  });
  it('部分退款取消续费后，期末终止回调撤销权益而不再次退款扣积分', async () => {
    seedPayment();
    const order = remoteOrder();
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    await deliver(provider, refund(order, '4.95'));
    order.status = 'canceled';
    await deliver(
      provider,
      webhook('subscription.canceled', {}, '2026-05-01T12:00:00Z')
    );
    expect(fixtures.state.payment[0]).toMatchObject({
      paid: false,
      status: 'canceled',
      cancelAtPeriodEnd: false,
    });
    expect(fixtures.state.userCredit[0].currentCredits).toBe(500);
    expect(fixtures.cancelSubscription).toHaveBeenCalledTimes(1);
  });
  it('全额退款只收回剩余积分，不扣其他来源积分，重试不重复扣', async () => {
    seedPayment('credit');
    const order = remoteOrder('credit');
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook('order.completed'));
    fixtures.state.creditTransaction[0].remainingAmount = 20;
    fixtures.state.userCredit[0].currentCredits = 70;
    const event = refund(order);
    await deliver(provider, event);
    await deliver(provider, event);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(50);
    expect(
      fixtures.state.creditTransaction.filter((row) => row.type === 'REFUND')
    ).toHaveLength(1);
    expect(fixtures.state.payment[0]).toMatchObject({
      paid: false,
      status: 'canceled',
    });
    expect(fixtures.cancelSubscription).not.toHaveBeenCalled();
  });
  it('部分退款按比例收回积分，保留未全额退款权益', async () => {
    seedPayment('credit');
    const order = remoteOrder('credit');
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook('order.completed'));
    await deliver(provider, refund(order, '4.95'));
    expect(fixtures.state.userCredit[0].currentCredits).toBe(50);
    expect(fixtures.state.payment[0].paid).toBe(true);
  });
  it('全额退款先到、付款通知后到不能重新发积分', async () => {
    seedPayment('credit');
    const order = remoteOrder('credit');
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, refund(order));
    await deliver(provider, webhook('order.completed'));
    expect(fixtures.state.userCredit).toHaveLength(0);
    expect(fixtures.state.payment[0].paid).toBe(false);
  });
  it('部分退款先到也会在发货时扣除对应积分', async () => {
    seedPayment('credit');
    const order = remoteOrder('credit');
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, refund(order, '4.95'));
    await deliver(provider, webhook('order.completed'));
    expect(fixtures.state.userCredit[0].currentCredits).toBe(50);
    expect(
      fixtures.state.creditTransaction.filter((row) => row.type === 'REFUND')
    ).toHaveLength(1);
  });
  it('退款付款 ID 不属于此订单时拒绝扣积分', async () => {
    seedPayment('credit');
    const order = remoteOrder('credit');
    mockOrder(order);
    const event = refund(order);
    event.data.paymentId = 'PAY_other';
    await expect(deliver(new WaffoProvider(), event)).rejects.toThrow('不属于');
    expect(fixtures.state.creditTransaction).toHaveLength(0);
  });
  it('旧月份退款保留后来已付费的当期权益，但也取消后续续费', async () => {
    seedPayment();
    const order = remoteOrder();
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    order.payments.push({
      ...order.payments[0],
      id: 'PAY_2',
      createdAt: '2026-05-01T12:00:00Z',
      refunds: [],
    });
    await deliver(provider, refund(order));
    expect(fixtures.state.payment[0].paid).toBe(true);
    expect(fixtures.state.payment[0].cancelAtPeriodEnd).toBe(true);
    expect(fixtures.cancelSubscription).toHaveBeenCalledExactlyOnceWith({
      orderId: 'ORD_1',
    });
  });
});

describe('换套餐与后续月度积分', () => {
  it('换套餐生效后只建立一份新订阅记录，旧套餐退出', async () => {
    seedPayment();
    const original = remoteOrder();
    mockOrder(original);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    const changed = remoteOrder();
    changed.id = 'ORD_2';
    changed.subscriptionProduct.id = 'PROD_year';
    changed.currentPeriodEnd = '2027-04-01';
    changed.payments[0].id = 'PAY_2';
    mockOrder(changed);
    const event = webhook(
      'subscription.plan_changed',
      { orderId: 'ORD_2' },
      '2026-04-02T12:00:00Z'
    );
    await deliver(provider, event);
    await deliver(provider, event);
    expect(fixtures.state.payment).toHaveLength(2);
    expect(fixtures.state.payment[0].status).toBe('canceled');
    expect(fixtures.state.payment[1]).toMatchObject({
      priceId: 'PROD_year',
      subscriptionId: 'ORD_2',
      interval: 'year',
      paid: true,
    });
    expect(fixtures.state.userCredit[0].currentCredits).toBe(1000);
  });
  it('预约换套餐不发新权益，换套餐失败时恢复原订阅续费状态', async () => {
    seedPayment();
    const original = remoteOrder();
    mockOrder(original);
    const provider = new WaffoProvider();
    await deliver(provider, webhook());
    const proposed = remoteOrder();
    proposed.id = 'ORD_2';
    proposed.status = 'pending';
    proposed.subscriptionProduct.id = 'PROD_year';
    fixtures.graphql.mockImplementation(async ({ variables }: any) => ({
      data: {
        subscriptionOrder: variables.id === 'ORD_1' ? original : proposed,
      },
    }));
    original.status = 'canceling';
    await deliver(
      provider,
      webhook(
        'subscription.plan_change_scheduled',
        { orderId: 'ORD_2' },
        '2026-04-02T12:00:00Z'
      )
    );
    expect(fixtures.state.payment[0]).toMatchObject({
      status: 'active',
      paid: true,
      cancelAtPeriodEnd: true,
    });
    original.status = 'active';
    proposed.status = 'canceled';
    await deliver(
      provider,
      webhook(
        'subscription.plan_change_failed',
        { orderId: 'ORD_2' },
        '2026-04-02T13:00:00Z'
      )
    );
    expect(fixtures.state.payment[0]).toMatchObject({
      status: 'active',
      paid: true,
      cancelAtPeriodEnd: false,
    });
    expect(fixtures.state.payment).toHaveLength(1);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(1000);
  });
  it.each([
    'lifetime',
    'yearly',
  ])('%s 后续每月积分关联原付款，全额退款后停止发放', async (kind) => {
    const scene = kind === 'lifetime' ? 'lifetime' : 'subscription';
    const record = seedPayment(scene);
    const order = remoteOrder(scene);
    if (kind === 'yearly') {
      record.priceId = 'PROD_year';
      order.subscriptionProduct.id = 'PROD_year';
      order.currentPeriodEnd = '2027-04-01';
    }
    mockOrder(order);
    const provider = new WaffoProvider();
    await deliver(
      provider,
      webhook(
        kind === 'lifetime' ? 'order.completed' : 'subscription.activated'
      )
    );
    vi.setSystemTime(new Date('2026-05-02T15:00:00Z'));
    const recipients = [
      { userId: 'user-1', priceId: record.priceId, paymentId: 'PAY_1' },
    ];
    const distribute =
      kind === 'lifetime'
        ? batchAddLifetimeMonthlyCredits
        : batchAddYearlyUsersMonthlyCredits;
    await distribute(recipients);
    await distribute(recipients);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(2000);
    expect(
      fixtures.state.creditTransaction.every((row) => row.paymentId === 'PAY_1')
    ).toBe(true);
    await deliver(provider, refund(order));
    expect(fixtures.state.userCredit[0].currentCredits).toBe(0);
    vi.setSystemTime(new Date('2026-06-02T15:00:00Z'));
    await distribute(recipients);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(0);
  });
  it('原有积分调用不传事务仍能发放且防重', async () => {
    const params = {
      userId: 'user-1',
      amount: 80,
      type: 'PURCHASE_PACKAGE',
      description: '测试旧调用',
      idempotencyKey: 'legacy-payment-1',
    };
    await addCredits(params);
    await addCredits(params);
    await addRegisterGiftCredits('user-1');
    expect(fixtures.state.userCredit[0].currentCredits).toBe(130);
    expect(fixtures.state.creditTransaction).toHaveLength(2);
  });
  it.each([
    'lifetime',
    'yearly',
  ])('关闭积分后 %s 定时任务也不再发放', async (kind) => {
    const scene = kind === 'lifetime' ? 'lifetime' : 'subscription';
    const record = seedPayment(scene);
    const order = remoteOrder(scene);
    if (kind === 'yearly') {
      record.priceId = 'PROD_year';
      order.subscriptionProduct.id = 'PROD_year';
      order.currentPeriodEnd = '2027-04-01';
    }
    mockOrder(order);
    await deliver(
      new WaffoProvider(),
      webhook(
        kind === 'lifetime' ? 'order.completed' : 'subscription.activated'
      )
    );
    fixtures.config.credits.enableCredits = false;
    vi.setSystemTime(new Date('2026-05-02T15:00:00Z'));
    const recipients = [
      { userId: 'user-1', priceId: record.priceId, paymentId: 'PAY_1' },
    ];
    await (kind === 'lifetime'
      ? batchAddLifetimeMonthlyCredits
      : batchAddYearlyUsersMonthlyCredits)(recipients);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(1000);
    expect(fixtures.state.creditTransaction).toHaveLength(1);
  });
});

describe('官方 SDK 验签', () => {
  it('使用真实 RSA 签名通过，篡改内容或过期签名拒绝', async () => {
    const sdk =
      await vi.importActual<typeof import('@waffo/pancake-ts')>(
        '@waffo/pancake-ts'
      );
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicKey = keys.publicKey
      .export({ format: 'pem', type: 'spki' })
      .toString();
    const body = JSON.stringify(webhook());
    const timestamp = Date.now();
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(`${timestamp}.${body}`),
      keys.privateKey
    ).toString('base64');
    expect(
      sdk.verifyWebhook(body, `t=${timestamp},v1=${signature}`, {
        publicKey,
        environment: 'test',
      }).eventType
    ).toBe('subscription.activated');
    expect(() =>
      sdk.verifyWebhook(`${body} `, `t=${timestamp},v1=${signature}`, {
        publicKey,
        environment: 'test',
      })
    ).toThrow();
    vi.advanceTimersByTime(46 * 60 * 1000);
    expect(() =>
      sdk.verifyWebhook(body, `t=${timestamp},v1=${signature}`, {
        publicKey,
        environment: 'test',
      })
    ).toThrow();
  });
});
