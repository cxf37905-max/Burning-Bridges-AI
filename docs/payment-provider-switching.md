# 支付商切换与手动验收

已同步模板最近两次提交：`d49c8a6`（Dodo Payments 与多支付商退款）、`51352c7`（路由视图过渡）。2026-10-14 已完成下述真实沙箱验收，当前默认恢复为 Waffo。全程未调用视频生成模型，未执行生产构建。

## 已完成的沙箱验收

| 检查 | 实际结果 |
| --- | --- |
| Waffo Single 支付 | 真实测试收银台付款成功，成功回调 HTTP 200，数据库增加 100 积分，12 个自然月到期 |
| Waffo 全额退款 | 商家后台执行测试退款，真实成功回调 HTTP 200，仅回收该订单剩余 100 积分 |
| 切换为 Dodo | 已创建测试 API Key、Webhook 和四档一次性产品；价格页购买直接进入 Dodo 测试收银台 |
| Dodo Single 与 Starter 支付 | 两笔真实沙箱付款分别增加 100、300 积分，数据库与付款记录一致 |
| Dodo 全额退款 | Single 测试退款成功，真实回调 HTTP 200，回收原订单 100 积分 |
| Dodo 重复及迟到事件 | 使用已确认的真实退款记录签名重放两次，再投递迟到付款成功事件，均 HTTP 200；没有重复回收或重新发放 |
| 支付商切换后的回调 | 默认 Dodo 时收到 Waffo 退款；恢复默认 Waffo 后重放 Dodo 回调，均按原支付商正常处理 |
| 账单入口 | 复用模板客户门户按钮；当前默认 Waffo 时，Dodo 购买记录仍创建 Dodo 测试门户并正确跳转；门户页面曾限流，发票页面未完成验收 |
| 支付与积分自动化检查 | `pnpm vitest run tests/payment/provider/ tests/credits/purchase-only.test.ts`：4 个文件、155 项通过 |

此次修复了 Dodo 一次性付款回调中的 `subscription_id: null` 校验问题。沙箱账户目前保留 Starter 订单对应的 300 测试积分：Dodo 退款要求商家钱包余额覆盖退款金额，第二笔测试订单用于补足钱包。没有手工修改余额，也没有替用户生成视频。

实际外部验收仅覆盖上表场景，不代表四档均实际付款、部分退款或所有失败事件均已逐项外部验收。相关其他边界由上述自动化检查覆盖。测试证据保存在项目外的 `D:\逆向\.investigations\payment-launch-20261014`，不提交密钥或原始支付凭据。

## 配置入口

`NEXT_PUBLIC_PAYMENT_PROVIDER="waffo"` 使用 Waffo；改成 `"dodo"` 使用 Dodo Payments。它控制服务端支付工厂、四档产品 ID、支付开放条件、积分购买弹窗、价格说明、隐私政策及条款中的支付商名称。账单逐笔保留实际支付商名称，不把旧订单改标为新支付商。

`NEXT_PUBLIC_` 变量会在构建时写入前端资源。本地改 `.env` 后，由用户重启 `pnpm dev` 并刷新页面；Vercel 改对应环境变量后，必须重新部署。它不支持只改后台变量就让已构建页面立即热切换，也不会在当前支付商出错时自动转投另一家。

## Dodo 测试环境

在 Dodo 后台切到测试环境，创建 API Key，并为 `https://公网测试域名/api/webhooks/dodo` 创建 Webhook，复制该端点的签名密钥。将下面的值填入本地 `.env` 或对应部署环境，密钥不得写进前端变量或提交 GitHub。

| 变量 | 内容 |
| --- | --- |
| `DODO_DEBUG` | 测试为 `true`；生产为 `false` |
| `DODO_PAYMENTS_API_KEY` | 同一环境的 API Key |
| `DODO_PAYMENTS_WEBHOOK_KEY` | 同一环境、本站端点的 Webhook 签名密钥 |
| `NEXT_PUBLIC_DODO_PRODUCT_CREDITS_BASIC` | 一次性 USD $9.90 产品，100 积分 |
| `NEXT_PUBLIC_DODO_PRODUCT_CREDITS_STANDARD` | 一次性 USD $19.90 产品，300 积分 |
| `NEXT_PUBLIC_DODO_PRODUCT_CREDITS_PREMIUM` | 一次性 USD $49.90 产品，900 积分 |
| `NEXT_PUBLIC_DODO_PRODUCT_CREDITS_ENTERPRISE` | 一次性 USD $89.90 产品，1800 积分 |

四个产品 ID 必须不同。当前项目只销售一次性积分包，模板中的月付、年付、终身产品变量暂不需要填写，也不会开放这些套餐。购买积分仍按 12 个自然月到期，注册不送积分。

订阅 `payment.succeeded`、`payment.failed`、`payment.cancelled`、`payment.processing`、`refund.succeeded`、`refund.failed`。模板也保留 `subscription.*` 处理能力，但本站没有启用订阅购买入口。退款失败不会回收积分；成功退款仅在支付平台已经执行、验签并向平台查证后处理，不新增用户自助退款或主动退钱功能。

本地继续使用 `NEXT_PUBLIC_BASE_URL=http://localhost:3000`；Dodo 按模板的 `return_url` 返回本站。Webhook 必须使用可访问 localhost 服务的公网 HTTPS 隧道地址，不能填写 localhost。Waffo 的 `WAFFO_RETURN_BASE_URL` 只用于 Waffo 测试回跳，不参与 Dodo 结账。

## 切换时保留旧配置

新订单按当前环境变量选择支付商；Waffo 回调始终由 `/api/webhooks/waffo` 处理，Dodo 回调始终由 `/api/webhooks/dodo` 处理。切换后不要删掉原支付商的密钥、四档产品 ID 或后台 Webhook，否则旧订单的迟到付款、退款和对账无法验证。浏览器付款回跳本身不发积分。

每笔付款按供应商付款 ID 写唯一积分流水。重复成功事件不能重复发放积分；成功付款后迟到的退款、退款后迟到的成功事件沿用模板统一退款记账。退款只回收原付款中尚未使用的积分，不扣其他订单积分或生成负余额。视频生成失败退积分仍是独立的原扣除积分返还，不能触发支付商退钱。

## 后续复验顺序

1. 保持 `waffo`：检查弹窗、价格页、隐私政策与条款显示 Waffo。使用沙箱购买一档，确认账单付款成功、积分只增加对应数量，流水具有原付款关联和到期时间。
2. 在 Waffo 后台重新投递同一成功事件，确认积分不再次增加。保留一笔未完成的 Waffo 测试订单供切换后验收。
3. 填好 Dodo 密钥和产品 ID，将支付商改成 `dodo`，重启本地或重新部署。检查公开名称变为 Dodo Payments，购买跳到 Dodo 测试收银台。
4. 分别验收 Dodo 的成功、处理中、失败、取消：只有核实成功付款后发积分。四档应分别增加 100、300、900、1800 积分。
5. 重新投递同一 Dodo 成功事件，确认付款记录和积分不重复。刷新页面与重新登录后，余额和账单应一致。
6. 当前使用 Dodo 时，完成或重新投递此前的 Waffo 订单，确认仍按 Waffo 验签并正常入账；账单显示原支付商。
7. 在沙箱由商家执行部分或全额退款，验收签名、查单、剩余积分回收以及重复回调防重；重投迟到付款事件，确认已全退订单不重新发积分。
8. 切回 `waffo`，重启或重新部署，确认新购买回到 Waffo；原 Dodo 订单回调仍可处理。

真实沙箱、外网隧道、密钥权限、Webhook 订阅和实际数据库事务需要上述手动验收。源码核对与模板自带测试文件不能证明这些外部条件已正常。

## 路由视图过渡

直接复用模板的 `RouteTransitions`、`RouteLink`、`LocaleLink` 及 CSS。本站主导航保持独立快照；同页锚点使用平滑滚动，同一锚点再次点击仍定位，品牌链接回到页顶；跨页继续使用模板视图过渡。支付外跳、下载和新标签链接保持各自行为。浏览器不支持或用户启用减少动态效果时正常导航。页面正文与元数据仍由原服务端组件输出，动画不包裹或延迟展示正文。
