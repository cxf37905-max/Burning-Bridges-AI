# AGENTS.md

This file provides guidance to Code Agents (Codex, Cursor, etc.) when working with code in this repository.

## 模板复用规则

- 模板已经实现的成熟功能，优先直接复用其组件、状态管理和交互流程，不另写一套等价逻辑。
- 登录态、加载占位、支付和积分等通用能力，按模板现有实现接入；品牌样式和明确提出的业务需求按用户要求调整。
- 确有必要偏离模板时，先向用户说明原因，再进行调整。
- 支付复用模板五个支付商及共享退款记账，当前默认 Dodo Payments。`NEXT_PUBLIC_PAYMENT_PROVIDER` 是新订单和公开支付商名称的唯一选择入口；切换后重启本地服务或重新构建部署，旧支付商回调按各自 URL 验签，保留原密钥和产品 ID。站内链接复用模板 `RouteLink` / `LocaleLink` 的视图过渡，不另造导航系统。

## 视频生成与重试规则

- 当前仅使用 Kling O3 Edit 单次15秒生成，默认 Standard。完整参考片在扣积分前上传私有R2，成功后本地FFmpeg加入前15秒原音轨；不再保留双段生成、拼接或旧版兼容。
- 主体照片使用 `elements[0].frontal_image_url`，必填提示词仅为 `Replace the main character in @Video1 with @Element1.`。不添加其他提示词，不编造多角度参考图。
- 代理不得自行调用模型API；每次真实生成必须取得用户针对该次生成的明确授权。本次维护禁止测试生成。
- 匹配任务ID和endpoint的API明确终态失败，只退回100站内积分一次，不退钱，不重新生成。失败证据来自最终队列错误，或官方Ed25519验签、提交绑定令牌和主动查询归属全部通过的ERROR回调。
- 提交超时但未拿到request_id时等待回调恢复身份，不能推断未计费，不能重发或退积分。每次提交绑定自己的submissionId；重复或迟到回调不重复记账。
- 只有明确HTTP发送前DNS/连接失败（ENOTFOUND/EAI_AGAIN/ECONNREFUSED/UND_ERR_CONNECT_TIMEOUT）最多额外重连2次，三次都确认未发送才退积分。普通超时、连接重置或HTTP错误不属于该证据。
- 内部查询、下载、音轨处理和保存失败只重查或重做同一任务的本地处理，不重发付费模型API，不退积分。
- 首次模型调用前必须成功提交扣100积分、消费流水和任务创建事务；每次模型提交再次校验本人消费流水、金额、任务租约和未退积分状态。敏感操作必须服务端Session鉴权。
- 刷新、返回、预览切换或关闭页面不新建任务。照片草稿24小时，成片访问期限14天；媒体实际删除使用R2原生生命周期：studio-inputs/满1天到期删除，studio-results/满15天到期删除，异步执行可能延后。生产桶规则须单独配置，不恢复外部定时删除接口。

## Development Commands

- `pnpm dev` - Start Next.js dev server
- `pnpm build` - Production build
- `pnpm lint` - Biome linter (auto-fixes with `--write`)
- `pnpm format` - Biome formatter
- `pnpm db:generate` - Generate Drizzle migration files from schema changes
- `pnpm db:migrate` - Apply pending migrations
- `pnpm db:push` - Push schema directly to DB (dev only)
- `pnpm db:studio` - Open Drizzle Studio GUI
- `pnpm email` - Email template preview server on port 3333
- `pnpm content` - Rebuild fumadocs MDX content collections
- `pnpm knip` - Find unused exports, dependencies, and files
- `pnpm auth:schema:generate` - Regenerate Better Auth schema to `src/db/auth.schema.ts`

按用户要求，不自动运行测试、构建、类型检查或 lint，不代替用户发起生成；由用户手动验收。

## Architecture Overview

### Routing & i18n
- App Router with `[locale]` dynamic segment using `next-intl` (as-needed prefix strategy — default locale omitted from URL)
- Route groups inside `[locale]`: `(marketing)` for public pages, `(protected)` for authenticated pages, `auth` for login/signup, `docs` for documentation
- API routes at `src/app/api/` (outside locale segment)
- Translation files: `messages/en.json`, `messages/zh.json`
- i18n routing config: `src/i18n/routing.ts`; middleware: `src/middleware.ts`

### Authentication (Better Auth)
- Server config: `src/lib/auth.ts`; client: `src/lib/auth-client.ts`
- PostgreSQL adapter via Drizzle, session cached 60s, 7-day expiry, fresh age disabled
- Plugins: admin, apiKey, emailHarmony (verification/password reset)
- OAuth: GitHub + Google with account linking
- Auth hooks auto-subscribe new users to newsletter and distribute registration credits
- Auth tables in `src/db/schema.ts`: `user`, `session`, `account`, `verification`, `apikey`

### Database (Drizzle ORM + PostgreSQL)
- Connection: `src/db/index.ts` using `postgres` driver (not `pg`), singleton pattern
- Schema: `src/db/schema.ts` — auth tables + `payment`, `userCredit`, `creditTransaction`
- Payment records track `type` (subscription/one-time), `scene` (lifetime/credit/subscription), `status`; unique constraint on `invoiceId`
- Config: `drizzle.config.ts` reads `DATABASE_URL` from env

### Server Actions (next-safe-action)
- Three-tier action clients in `src/lib/safe-action.ts`:
  - `actionClient` — base, no auth required
  - `userActionClient` — requires authenticated session, ctx includes user/session
  - `adminActionClient` — requires admin role
- All actions use Zod schemas for input validation
- Actions organized by feature in `src/actions/`

### Payment System (Stripe)
- Provider pattern in `src/payment/` with Stripe as implementation
- Plans defined in `src/config/website.tsx`: Free (50 credits), Pro ($9.90/mo or $99/yr, 1000 credits), Lifetime ($199 one-time, 1000 credits)
- Credit packages: Basic (100), Standard (200), Premium (500)
- Webhook handler validates signature and distributes credits on payment completion
- Checkout flow: server action → create Stripe customer if needed → record payment → redirect to Stripe → webhook updates record

### Credits System
- Core logic in `src/credits/`
- 7 transaction types: `MONTHLY_REFRESH`, `REGISTER_GIFT`, `PURCHASE_PACKAGE`, `SUBSCRIPTION_RENEWAL`, `LIFETIME_MONTHLY`, `USAGE`, `EXPIRE`
- Credits tracked in `userCredit` table with history in `creditTransaction`
- Monthly distribution via `pnpm distribute-credits` script

### Provider Pattern (used throughout)
All external integrations follow a pluggable provider pattern with factory functions:
- Payment: `src/payment/` (Stripe)
- Mail: `src/mail/` (Resend, React Email templates — all localized)
- Notifications: `src/notification/` (Discord, Feishu)
- Storage: `src/storage/` (S3 via `s3mini`)
- AI: `src/ai/` (multiple image generation providers)

### State & Data Flow
- Server components fetch data directly; mutations via server actions
- Zustand stores in `src/stores/` for client-side state
- React Query for async data on client
- Forms use React Hook Form + Zod validation

### Content
- Fumadocs for documentation (`content/docs/`), MDX blog (`content/blog/`)
- Source config: `source.config.ts`; rebuild with `pnpm content`

### Configuration
- Centralized app config with feature flags: `src/config/website.tsx`
- Environment template: `env.example`

## Code Style

- Biome enforces: 2-space indentation, 80-char line width, single quotes, ES5 trailing commas, semicolons required
- Filenames: kebab-case (`dashboard-sidebar.tsx`); hooks prefixed `use-` (`use-session.ts`)
- Named exports preferred; default exports only for pages/layouts
- Server-only code marked with `"use server"` directive
- Tailwind CSS v4 with tokens in `src/styles/`
- UI primitives from Radix UI; icons from `lucide-react`
- Conventional Commits: `feat:`, `fix:`, `chore:`
