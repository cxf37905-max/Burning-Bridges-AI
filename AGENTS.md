# AGENTS.md

This file provides guidance to Code Agents (Codex, Cursor, etc.) when working with code in this repository.

## 模板复用规则

- 模板已经实现的成熟功能，优先直接复用其组件、状态管理和交互流程，不另写一套等价逻辑。
- 登录态、加载占位、支付和积分等通用能力，按模板现有实现接入；品牌样式和明确提出的业务需求按用户要求调整。
- 确有必要偏离模板时，先向用户说明原因，再进行调整。

## 视频生成与重试规则

- 使用 Kling O3 Edit 两段生成、本地 FFmpeg 拼接和原音轨流程，默认 Standard。提示词只保留接口必填的一句：`Replace the main character in @Video1 with the main character in @Image1.`，不添加服装、背景、动作等额外提示。
- 用户已授权第一阶段接缝优化：新任务第二段参考视频增加第一段末尾24帧（1秒），上传到私有R2并随任务保存签名链接和重叠信息。合成时比较重叠区同一时刻的画面、边缘和局部运动差异，选择切点，同步裁剪两段，恰好去掉24帧重复内容。原音轨连续播放，不做叠化、补帧或追加模型生成。旧任务没有重叠信息，沿用旧合成，不能误删一秒。
- 两段都明确失败时直接退回100积分；一段成功、另一段明确失败时，保留成功段，只重新生成失败段，最多额外两次。这些重生成会产生额外供应商费用，用户已明确授权恢复旧版规则。
- 失败段累计三次不同 request_id 的明确失败证据后，才退回100积分；另一段尚未完成时等待其结果，不提前退积分或重生成。
- 普通超时、传输结果不明、查询失败和成片保存失败，只重试原任务的状态查询或保存操作，不退积分。明确HTTP发送前连接失败按下述独立规则处理。
- 所有生成失败返还都是退回站内积分，不是退钱，不调用支付商退钱接口。明确失败证据可以来自匹配 endpoint/request_id 的最终队列错误，或经fal官方Ed25519验签、本站提交绑定令牌校验并主动查队列确认归属的ERROR回调。退积分与终止状态在同一事务提交，退积分后不再重生成。
- 提交响应超时且没有 request_id 时等待fal回调自动恢复任务身份；不能仅凭超时、连接重置、没有回调或暂时查不到账单推断没有生成或计费，也不能据此重发或退积分。每次网站提交及重生成均绑定自己的提交标识和回调地址，迟到回调不能覆盖新提交；回调重复投递不产生重复失败记录或积分返还。
- 仅Node fetch明确报告HTTP发送前的DNS解析失败、连接被拒绝或连接阶段超时（ENOTFOUND/EAI_AGAIN/ECONNREFUSED/UND_ERR_CONNECT_TIMEOUT）允许串行重试连接，最多额外2次。三次均取得明确未发送证据后保存证据；其他分段已结束或未提交时退回100积分，其他分段尚在运行或身份未知时先等待结果。普通ETIMEDOUT、ECONNRESET、HTTP错误不属于此类证据。
- 首次调用模型前必须已成功提交扣100积分、写消费流水和建立任务的数据库事务。每次实际模型提交再次校验同一用户的video消费流水、金额、当前任务租约及未退积分状态，前端标记不作为扣费依据。
- 首页从本人数据库任务恢复生成进度，不因刷新、跳转、切换预览或关闭页面重新创建任务。照片草稿仅在当前浏览器保存24小时，成片沿用14天保留规则。

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
