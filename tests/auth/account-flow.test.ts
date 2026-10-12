import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '../../src/db/schema';

const dependencies = vi.hoisted(() => ({ getDb: vi.fn(), sendEmail: vi.fn() }));
vi.mock('../../src/db', () => ({ getDb: dependencies.getDb }));
vi.mock('../../src/mail', () => ({ sendEmail: dependencies.sendEmail }));

const postgres = new PGlite();
const db = drizzle(postgres, { schema });
let auth: typeof import('../../src/lib/auth')['auth'];
const origin = 'http://localhost:3000';
beforeAll(async () => {
  const directory = new URL('../../src/db/migrations/', import.meta.url);
  for (const filename of (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort())
    await postgres.exec(await readFile(new URL(filename, directory), 'utf8'));
  dependencies.getDb.mockResolvedValue(db);
  dependencies.sendEmail.mockResolvedValue({ success: true });
  vi.stubEnv(
    'BETTER_AUTH_SECRET',
    'local-integration-test-secret-at-least-32-characters'
  );
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', origin);
  ({ auth } = await import('../../src/lib/auth'));
}, 30_000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await postgres.close();
});

function request(path: string, body: Record<string, unknown>, cookie?: string) {
  return auth.handler(
    new Request(origin + '/api/auth/' + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    })
  );
}
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}
async function expectNoCredits() {
  expect(await db.select().from(schema.userCredit)).toHaveLength(0);
  expect(await db.select().from(schema.creditTransaction)).toHaveLength(0);
}

describe('模板认证真实处理器与本地 PostgreSQL', () => {
  it('邮箱注册直接建立会话、登录和退出均不赠送积分，密码以哈希存储', async () => {
    const email = 'account@example.com';
    const password = 'Local-test-password-729!';
    const signup = await request('sign-up/email', {
      email,
      password,
      name: 'Account owner',
      callbackURL: '/#studio',
    });
    expect(signup.status).toBe(200);
    const [registered] = await db.select().from(schema.user);
    expect(registered.emailVerified).toBe(false);
    const [credential] = await db.select().from(schema.account);
    expect(credential.password).toBeTruthy();
    expect(credential.password).not.toBe(password);
    await expectNoCredits();
    expect(cookies(signup)).toContain('session_token=');
    expect(dependencies.sendEmail).not.toHaveBeenCalled();
    const signupSession = await auth.api.getSession({
      headers: new Headers({ cookie: cookies(signup) }),
    });
    expect(signupSession?.user.id).toBe(registered.id);
    expect(signupSession?.user.emailVerified).toBe(false);
    const login = await request('sign-in/email', { email, password });
    expect(login.status).toBe(200);
    const cookie = cookies(login);
    expect(cookie).toContain('session_token=');
    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(session?.user.id).toBe(registered.id);
    await expectNoCredits();
    const logout = await request('sign-out', {}, cookie);
    expect(logout.status).toBe(200);
    expect(
      (await db.select().from(schema.session)).some(
        (record) => record.id === session?.session.id
      )
    ).toBe(false);
    expect(
      logout.headers
        .getSetCookie()
        .some((value) => value.includes('session_token=;'))
    ).toBe(true);
    await expectNoCredits();
  });
  it('找回密码使用模板验证令牌，重置后旧密码失效且不送积分', async () => {
    const resetRequest = await request('request-password-reset', {
      email: 'account@example.com',
      redirectTo: '/auth/reset-password',
    });
    expect(resetRequest.status).toBe(200);
    const email = dependencies.sendEmail.mock.calls.find(
      ([message]) => message.template === 'forgotPassword'
    )?.[0];
    expect(email).toBeDefined();
    const token = new URL(email.context.url).pathname.split('/').at(-1);
    const reset = await request('reset-password', {
      token,
      newPassword: 'Changed-test-password-728!',
    });
    expect(reset.status).toBe(200);
    expect(
      (
        await request('sign-in/email', {
          email: 'account@example.com',
          password: 'Local-test-password-729!',
        })
      ).status
    ).toBe(401);
    expect(
      (
        await request('sign-in/email', {
          email: 'account@example.com',
          password: 'Changed-test-password-728!',
        })
      ).status
    ).toBe(200);
    await expectNoCredits();
  });
  it('旧钱包已被数据库迁移删除', async () => {
    const result = await postgres.query<{ table: string | null }>(
      "SELECT to_regclass('public.studio_wallet')::text AS table"
    );
    expect(result.rows[0].table).toBeNull();
  });
});
