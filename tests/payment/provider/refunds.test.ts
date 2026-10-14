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
  desc: vi.fn(),
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({
    strings: [...strings],
    values,
  }),
}));
const activeProvider = vi.hoisted(() => ({ name: 'stripe' }));
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
    return key ? { provider: activeProvider.name, key } : null;
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

const remote = vi.hoisted(() => ({
  refund: {
    id: 'REF1',
    status: 'succeeded',
    amount: 500,
    currency: 'usd',
    charge: 'CHARGE1',
  },
  receipt: {
    id: 'RECEIPT1',
    amount: 1000,
    currency: 'usd',
    customer: 'CUSTOMER1',
    invoice: 'RECEIPT1',
    subscription: 'SUB1',
    status: 'partially_refunded',
    refundedAmount: 500,
  },
  subscription: {
    id: 'SUB1',
    status: 'active',
    cancel_at_period_end: false,
    latest_invoice: 'RECEIPT1',
    lastTransactionId: 'RECEIPT1',
  },
  cancel: vi.fn(),
}));
vi.mock('stripe', () => ({
  Stripe: class {
    webhooks = { constructEvent: (payload: string) => JSON.parse(payload) };
    refunds = {
      retrieve: async () => remote.refund,
      list: () => ({
        async *[Symbol.asyncIterator]() {
          yield remote.refund;
        },
      }),
    };
    charges = { retrieve: async () => remote.receipt };
    invoices = {
      retrieve: async () => ({ id: 'RECEIPT1', subscription: 'SUB1' }),
    };
    subscriptions = {
      retrieve: async () => remote.subscription,
      update: remote.cancel,
    };
  },
}));
vi.mock('creem', () => ({
  Creem: class {
    transactions = { getById: async () => remote.receipt };
    subscriptions = {
      get: async () => remote.subscription,
      cancel: remote.cancel,
    };
  },
}));
vi.mock('@/credits/server', () => ({
  getCreditPackageById: () => fixtures.pack,
}));

import { StripeProvider } from '@/payment/provider/stripe';
import { CreemProvider } from '@/payment/provider/creem';
import { PaypalProvider } from '@/payment/provider/paypal';
import { addCredits, settlePaymentRefund } from '@/credits/credits';

function seed(scene = 'subscription') {
  const record: any = {
    id: 'PAYMENT1',
    userId: 'USER1',
    customerId: 'CUSTOMER1',
    priceId: 'PROD_month',
    subscriptionId: scene === 'subscription' ? 'SUB1' : null,
    invoiceId: 'RECEIPT1',
    sessionId: 'ORDER1',
    paymentSyncId: 'SYNC1',
    type: scene === 'subscription' ? 'subscription' : 'one_time',
    scene,
    paid: true,
    status: scene === 'subscription' ? 'active' : 'completed',
    cancelAtPeriodEnd: false,
    periodEnd: new Date('2027-01-01'),
  };
  fixtures.state.payment.push(record);
  fixtures.state.creditTransaction.push({
    id: 'GRANT1',
    userId: 'USER1',
    paymentId: 'RECEIPT1',
    type: 'SUBSCRIPTION_RENEWAL',
    amount: 1000,
    remainingAmount: 800,
    description: '付款积分',
  });
  fixtures.state.creditTransaction.push({
    id: 'GIFT1',
    userId: 'USER1',
    type: 'REGISTER_GIFT',
    amount: 50,
    remainingAmount: 50,
    description: '注册赠送',
  });
  fixtures.state.userCredit.push({
    id: 'BALANCE1',
    userId: 'USER1',
    currentCredits: 850,
  });
  return record;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(fixtures.state)) fixtures.state[key] = [];
  fixtures.setFailPaymentUpdate(false);
  Object.assign(remote.refund, { status: 'succeeded', amount: 500 });
  Object.assign(remote.receipt, {
    subscription: 'SUB1',
    amount: 1000,
    refundedAmount: 500,
    status: 'partially_refunded',
    customer: 'CUSTOMER1',
  });
  Object.assign(remote.subscription, {
    status: 'active',
    cancel_at_period_end: false,
    latest_invoice: 'RECEIPT1',
    lastTransactionId: 'RECEIPT1',
  });
  remote.cancel.mockImplementation(async () => ({
    id: 'SUB1',
    status: activeProvider.name === 'creem' ? 'scheduled_cancel' : 'active',
    cancel_at_period_end: true,
  }));
  for (const key of [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'CREEM_API_KEY',
    'CREEM_WEBHOOK_SECRET',
    'PAYPAL_CLIENT_ID',
    'PAYPAL_CLIENT_SECRET',
    'PAYPAL_WEBHOOK_ID',
  ])
    vi.stubEnv(key, 'test-placeholder');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function deliver(provider: string, amount = 500) {
  activeProvider.name = provider;
  remote.refund.amount = amount;
  remote.receipt.refundedAmount = amount;
  if (provider === 'stripe') {
    return new StripeProvider().handleWebhookEvent(
      JSON.stringify({
        type: 'refund.updated',
        data: { object: { id: 'REF1' } },
      }),
      'valid'
    );
  }
  if (provider === 'creem') {
    const payload = JSON.stringify({
      eventType: 'refund.created',
      object: {
        id: 'REF1',
        status: remote.refund.status,
        refund_amount: amount,
        refund_currency: 'USD',
        transaction: { id: 'RECEIPT1' },
      },
    });
    return new CreemProvider().handleWebhookEvent(
      payload,
      createHmac('sha256', 'test-placeholder').update(payload).digest('hex')
    );
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      const path = new URL(url).pathname;
      const json = (value: unknown) =>
        new Response(JSON.stringify(value), { status: 200 });
      if (path.endsWith('/token')) return json({ access_token: 'TESTTOKEN' });
      if (path.endsWith('/verify-webhook-signature'))
        return json({ verification_status: 'SUCCESS' });
      if (path.endsWith('/refund/REF1'))
        return json({
          id: 'REF1',
          state:
            remote.refund.status === 'succeeded'
              ? 'completed'
              : remote.refund.status,
          sale_id: 'RECEIPT1',
          amount: { total: (amount / 100).toFixed(2), currency: 'USD' },
        });
      if (path.endsWith('/refunds/REF1'))
        return json({
          id: 'REF1',
          status:
            remote.refund.status === 'succeeded'
              ? 'COMPLETED'
              : remote.refund.status.toUpperCase(),
          amount: { value: (amount / 100).toFixed(2), currency_code: 'USD' },
          links: [
            {
              rel: 'up',
              href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/RECEIPT1',
            },
          ],
        });
      if (path.endsWith('/captures/RECEIPT1'))
        return json({
          id: 'RECEIPT1',
          status: amount === 1000 ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          amount: { value: '10.00', currency_code: 'USD' },
        });
      if (path.endsWith('/sale/RECEIPT1'))
        return json({
          id: 'RECEIPT1',
          billing_agreement_id: 'SUB1',
          state: amount === 1000 ? 'refunded' : 'partially_refunded',
          amount: { total: '10.00', currency: 'USD' },
        });
      if (path.endsWith('/subscriptions/SUB1/cancel')) {
        await remote.cancel();
        return new Response(null, { status: 204 });
      }
      if (path.endsWith('/subscriptions/SUB1'))
        return json({
          id: 'SUB1',
          plan_id: 'PROD_month',
          status: remote.subscription.status.toUpperCase(),
        });
      throw new Error(`未模拟 PayPal 请求：${options.method}/${path}`);
    })
  );
  const headers = new Headers(
    Object.fromEntries(
      [
        'auth-algo',
        'cert-url',
        'transmission-id',
        'transmission-sig',
        'transmission-time',
      ].map((key) => [`paypal-${key}`, 'test'])
    )
  );
  return new PaypalProvider().handleWebhookEvent(
    JSON.stringify({
      id: 'EVENT1',
      event_type:
        fixtures.state.payment[0].type === 'one_time'
          ? 'PAYMENT.CAPTURE.REFUNDED'
          : 'PAYMENT.SALE.REFUNDED',
      resource: { id: 'REF1' },
    }),
    '',
    headers
  );
}

describe.each([
  'stripe',
  'creem',
  'paypal',
])('%s 退款业务一致性', (provider) => {
  it('部分退款回收对应积分、停止续费、保留注册积分和当前权益', async () => {
    seed();
    await deliver(provider);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(350);
    expect(fixtures.state.creditTransaction[1].remainingAmount).toBe(50);
    expect(fixtures.state.payment[0]).toMatchObject({
      paid: true,
      status: 'active',
      cancelAtPeriodEnd: true,
    });
    expect(remote.cancel).toHaveBeenCalledTimes(1);
  });
  it('全额退款回收未使用积分，撤销当前付款权益', async () => {
    seed();
    await deliver(provider, 1000);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(50);
    expect(fixtures.state.payment[0]).toMatchObject({
      paid: false,
      status: 'canceled',
    });
  });
  it('一次性订单退款只处理原积分和权益，不调用取消订阅', async () => {
    seed('credit');
    remote.receipt.subscription = '';
    await deliver(provider, 1000);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(50);
    expect(fixtures.state.payment[0].paid).toBe(false);
    expect(remote.cancel).not.toHaveBeenCalled();
  });
  it('退款关联到其他客户时拒绝处理', async () => {
    seed();
    remote.receipt.customer = 'OTHER_CUSTOMER';
    if (provider === 'paypal') {
      fixtures.state.payment[0].priceId = 'UNKNOWN_PRICE';
    }
    await expect(deliver(provider)).rejects.toThrow();
    expect(fixtures.state.userCredit[0].currentCredits).toBe(850);
  });
  it('已取消或已停止续费时不重复请求取消', async () => {
    seed();
    remote.subscription.status =
      provider === 'creem'
        ? 'scheduled_cancel'
        : provider === 'paypal'
          ? 'CANCELLED'
          : 'canceled';
    await deliver(provider);
    expect(remote.cancel).not.toHaveBeenCalled();
    expect(fixtures.state.userCredit[0].currentCredits).toBe(350);
  });
  it('相同退款通知重复发送不重复扣积分', async () => {
    seed();
    await deliver(provider);
    await deliver(provider);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(350);
    expect(
      fixtures.state.creditTransaction.filter((row) => row.type === 'REFUND')
    ).toHaveLength(1);
  });
  it('取消失败抛出异常，回调重试只补做取消', async () => {
    seed();
    remote.cancel.mockRejectedValueOnce(new Error('取消暂时失败'));
    await expect(deliver(provider)).rejects.toThrow();
    expect(fixtures.state.payment[0].cancelAtPeriodEnd).toBe(false);
    await deliver(provider);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(350);
    expect(remote.cancel).toHaveBeenCalledTimes(2);
  });
  it.each([
    'pending',
    'failed',
  ])('退款 %s 时不扣积分、不取消', async (status) => {
    seed();
    remote.refund.status = status;
    await deliver(provider);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(850);
    expect(remote.cancel).not.toHaveBeenCalled();
  });
});

describe('通用退款事务与乱序', () => {
  it('退款查询后新续费已入账时，不使用旧快照撤销新账期', async () => {
    const current = seed();
    const snapshot = { ...current };
    current.invoiceId = 'RECEIPT2';
    await settlePaymentRefund({
      provider: 'stripe',
      refundId: 'REF1',
      record: snapshot,
      paymentId: 'RECEIPT1',
      originalAmount: 1000,
      refundedAmount: 1000,
      latestPaymentId: 'RECEIPT1',
    });
    expect(fixtures.state.payment[0].paid).toBe(true);
  });
  it('已用完原付款积分时记录退款，但不扣其他赠送积分', async () => {
    const record = seed();
    fixtures.state.creditTransaction[0].remainingAmount = 0;
    fixtures.state.userCredit[0].currentCredits = 50;
    await settlePaymentRefund({
      provider: 'stripe',
      refundId: 'REF1',
      record,
      paymentId: 'RECEIPT1',
      originalAmount: 1000,
      refundedAmount: 1000,
    });
    expect(fixtures.state.userCredit[0].currentCredits).toBe(50);
    expect(fixtures.state.creditTransaction.at(-1)?.amount).toBe(0);
  });
  it('多次部分退款累计成全额时回收全部剩余，重复通知不再扣', async () => {
    const record = seed();
    const input = {
      provider: 'stripe',
      refundId: 'REF1',
      record,
      paymentId: 'RECEIPT1',
      originalAmount: 1000,
      refundedAmount: 400,
    };
    await settlePaymentRefund(input);
    await settlePaymentRefund({
      ...input,
      refundId: 'REF2',
      refundedAmount: 600,
    });
    await settlePaymentRefund(input);
    expect(fixtures.state.userCredit[0].currentCredits).toBe(50);
    expect(fixtures.state.payment[0].paid).toBe(false);
  });
  it('退款先到、积分后发时仍按退款比例结算', async () => {
    const record = seed();
    fixtures.state.creditTransaction = [];
    fixtures.state.userCredit = [];
    await settlePaymentRefund({
      provider: 'stripe',
      refundId: 'REF1',
      record,
      paymentId: 'RECEIPT1',
      originalAmount: 1000,
      refundedAmount: 500,
    });
    await addCredits({
      userId: 'USER1',
      amount: 1000,
      type: 'SUBSCRIPTION_RENEWAL',
      description: '订阅积分',
      paymentId: 'RECEIPT1',
      idempotencyKey: 'GRANT1',
    });
    expect(fixtures.state.userCredit[0].currentCredits).toBe(500);
  });
  it('历史付款退款不撤销后续已支付账期', async () => {
    const record = seed();
    record.invoiceId = 'RECEIPT2';
    await settlePaymentRefund({
      provider: 'stripe',
      refundId: 'REF1',
      record,
      paymentId: 'RECEIPT1',
      originalAmount: 1000,
      refundedAmount: 1000,
    });
    expect(fixtures.state.payment[0].paid).toBe(true);
  });
  it('余额不一致时退款事务整体回滚', async () => {
    const record = seed();
    fixtures.state.userCredit[0].currentCredits = 10;
    await expect(
      settlePaymentRefund({
        provider: 'stripe',
        refundId: 'REF1',
        record,
        paymentId: 'RECEIPT1',
        originalAmount: 1000,
        refundedAmount: 500,
      })
    ).rejects.toThrow('余额与流水不一致');
    expect(fixtures.state.creditTransaction[0].remainingAmount).toBe(800);
    expect(fixtures.state.creditTransaction).toHaveLength(2);
  });
});
