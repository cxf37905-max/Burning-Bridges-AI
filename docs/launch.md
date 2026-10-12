# Burning Bridges AI 运行与接入

项目：`D:\逆向\burning-bridges-studio`。模板来源：<https://github.com/cxf37905-max/cxf_template>。Node.js24、pnpm10.33.2、Next.js16 App Router。

## 本地预览

```powershell
pnpm install
pnpm content
pnpm dev --port 3010
```

访问 <http://localhost:3010>。无凭据可浏览首页、选择本地照片、播放带来源标注的参考视频和查看套餐，不生成、不收款。真实模型测试先看 [kling-testing.md](./kling-testing.md)，只需fal Key与照片。

## 配置

从 `env.example` 配置 `.env.local`，保留 `STUDIO_LAUNCH_READY=false`，不要提交密钥。

| 配置 | 用途 |
|---|---|
| `NEXT_PUBLIC_BASE_URL` | 生产 `https://burningbridgesai.cc`；本地 `http://localhost:3010` |
| `DATABASE_URL` | Neon PostgreSQL；迁移前备份现有数据库 |
| `BETTER_AUTH_SECRET` | 模板 BetterAuth 的强随机密钥（至少32字符） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth，回调 `/api/auth/callback/google` |
| `RESEND_API_KEY` | 仅用于找回密码；邮箱注册登录无需邮件服务 |
| `FAL_KEY` | 服务端fal Key，仅调用两段Kling O3 Edit |
| `FFMPEG_PATH` | 可选，本地FFmpeg绝对路径；默认使用依赖自带二进制 |
| `STUDIO_KLING_TIER` | 默认standard，可选pro；用户价格不自动变更 |
| `CRON_SECRET` | 至少32字符，后台调度Bearer鉴权 |
| `STORAGE_ENDPOINT` | Cloudflare R2账号HTTPS端点 |
| `STORAGE_BUCKET_NAME` / `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | 私有R2桶读写凭据 |
| `NEXT_PUBLIC_PAYMENT_PROVIDER` | 填 `waffo`，统一使用最新版模板的 Pancake 支付接口 |
| `WAFFO_MERCHANT_ID` / `WAFFO_PRIVATE_KEY` / `WAFFO_STORE_ID` | 同一测试环境下的商户 ID、完整 RSA PEM 私钥和商店 ID；私钥可用 `\n` 表示换行 |
| `WAFFO_DEBUG` | 测试填 `true`；生产填 `false`。验签公钥由官方 SDK 提供 |
| `NEXT_PUBLIC_WAFFO_PRODUCT_CREDITS_BASIC` | 一次性 USD 产品：$9.90，100 积分，1 个视频 |
| `NEXT_PUBLIC_WAFFO_PRODUCT_CREDITS_STANDARD` | 一次性 USD 产品：$19.90，300 积分，3 个视频 |
| `NEXT_PUBLIC_WAFFO_PRODUCT_CREDITS_PREMIUM` | 一次性 USD 产品：$49.90，900 积分，9 个视频 |
| `NEXT_PUBLIC_WAFFO_PRODUCT_CREDITS_ENTERPRISE` | 一次性 USD 产品：$89.90，1800 积分，18 个视频 |

认证复用模板 Better Auth、用户表与会话，邮箱密码和 Google 登录共用同一账户系统。支付复用模板 `@waffo/pancake-ts@0.25.0`，设置 `NEXT_PUBLIC_PAYMENT_PROVIDER=waffo`。在 Waffo 测试商店创建并发布四档一次性产品，金额与币种必须和上表一致。旧 Waffo SDK、旧回调和旧入账实现已移除，使用本节配置替换之前的接入说明。

测试付款需要公网 HTTPS 测试站或 HTTPS 隧道，将 `NEXT_PUBLIC_BASE_URL` 设置为实际访问地址。Waffo 后台配置 `/api/webhooks/waffo`，订阅 `order.completed` 和 `refund.succeeded`；回调必须能从公网直接访问，不能被部署访问保护拦截。支付相关变量只放测试环境，修改后重启本地服务或重新部署测试站。单纯预览和邮箱登录仍可使用 localhost。若通过隧道测试 Google 登录，还需在 Google 后台登记隧道域名的回调地址。

## 数据库

支付、余额与流水统一使用模板原有 `payment`、`user_credit` 和 `credit_transaction`，视频任务使用 `studio_video`。业务代码已移除旧 `studio_order` 表定义和读写；历史迁移文件保留，本次不执行删除数据库表或修改数据库数据的操作。模板的付款状态、积分批次和余额在同一事务提交，重复回调不会重复入账。购买积分按 12 个自然月到期，生成失败返还积分沿用原到期时间；支付退款按模板规则收回尚未使用的积分并记录流水。

注册、邮箱登录、Google 登录、免费套餐、订阅及定期分发均不会赠送积分。新用户余额为0，100积分生成一条视频；失败退款只返还原扣费，不发放新积分。

```powershell
pnpm db:migrate
```

## 视频生成

模型为fal.ai Kling O3 Edit。宴会参考片12秒+约8.04秒；酒店13秒+7秒。同一照片分别配两段原片替换主角，保留原服装/动作。两段成功后，服务端本地FFmpeg按模板720p/24fps配置拼接并加原音轨，上传私有R2后交付。不调用fal合成接口，不进行本地成片验收或元数据检查。用户已确认原视频和音频授权。

两套完整参考效果、四段模型参考视频、两条原音轨及两张封面，已真实下载到 `public/studio/reference/`，附原始URL、大小和SHA-256清单。首页从本站读取视频与封面。模型暂用已验证的原公网素材URL；本站上线后可迁移到本站或R2的公网HTTPS路径。详见素材目录的 `README.md`。

一次父任务从模板积分表扣100积分并写入唯一消费流水。照片先准备，准备失败不扣次数且不调用fal，可重试同一提交。稳定请求ID、照片哈希、事务扣费、180秒租约及分步request_id防重复。两段都明确失败直接退款；一段成功则只重试失败段，最多额外2次，每次必须等待当前任务明确失败，禁止并行重试。失败段三次均明确失败后退回1次。每份证据必须是对应fal任务COMPLETED响应含error/error_type，退款事务匹配已保存完整状态快照。未知提交停止新请求，人工核对；查询暂时失败只重查。HTTP错误或缺少链接不单独触发退款。两段成功后本地合成失败只内部重试，不退次数、不重调模型。详见[kling-testing.md](./kling-testing.md)。此为本站政策，对标公开前端不能证明它采用相同后端规则。

页面每8秒查询；后台每分钟推进两条待处理任务，使用同一租约。须配置 `CRON_SECRET` 并启用调度；Vercel每分钟Cron要求Pro/Enterprise，其他平台可用外部调度器，详见测试文档。没有调度时，页面关闭后的本站合成步骤在下次查询继续。

照片去元数据转JPEG，长边最多1536；私有R2输入签名有效24小时。`/api/studio/cleanup` 每小时扫描 `studio-inputs/` 和 `studio-results/`，按R2对象实际上传时间删除满24小时的照片和满14天的成片，含未成功建立数据库任务的过期照片。清理失败会让调度请求失败，下一次调度继续；调度正常时通常在到期后的1小时内删除。生成服务要求配置至少32字符的 `CRON_SECRET`；配置密钥不等于调度已生效，上线必须实际验证清理执行。

成片通过需要本人会话的 `/api/studio/videos/[id]/file` 获取新的短时签名（最长5分钟，且不超过剩余保留期），不再向用户交付固定7天链接。14天从任务成功、R2成片上传时起算；访问同时检查任务成功时间与R2对象上传时间，到期返回410。历史任务/账单/积分记录保留，不因文件到期退款。不清理授权参考素材、头像或其他前缀。桶必须私有，不启用公共访问或绕过此访问入口的缓存。本次只实施本站存储的文件留存。

上线需R2凭据拥有目标桶的列举、读、写、删对象权限，并部署 `vercel.json` 两项调度。非Vercel平台调用 `/api/studio/tasks`（每分钟）和 `/api/studio/cleanup`（每小时），均带 `Authorization: Bearer <CRON_SECRET>`；不要在浏览器或公开日志中放密钥。Vercel计划须支持这些频率。首次生产验收用已过期的测试对象确认真实删除，并确认新对象、其他前缀不受影响；本地模拟测试不证明生产调度已运行。照片到期后不会为了重试自动重新上传或增加模型提交。

真实样片需人工查看人物一致性、接缝和节拍。部署需可执行FFmpeg、可写临时目录及120秒路由预算；目标平台重新安装依赖，不复制Windows二进制。

## Waffo

创建订单：`POST /api/studio/checkout`；模板通知入口：`POST https://测试站域名/api/webhooks/waffo`。前者从服务端会话读取当前用户，后者校验 `X-Waffo-Signature`，检查商店与测试/生产环境，并主动查单后再确认付款或退款。浏览器付款成功回跳不会直接发放积分。

官方 SDK 验证签名，并检查回调商店、环境、用户、产品和站内支付标识；结账前核对平台产品金额与币种，回调主动查询到真实成功付款后才在事务内发放积分。返回成功页面不会直接发放积分。付款后回首页恢复草稿，由用户再次点击生成；余额不足时提供套餐入口。真实沙箱收款、回调入账和退款由用户手动验收。

## 验证和上线

```powershell
pnpm test
pnpm typecheck
pnpm build
```

测试含邮箱注册后直接登录、退出与找回密码不赠送积分，以及WASM PostgreSQL真实SQL/事务，验证重复提交、余额不足回滚、失败只退一次、退款写失败回滚、重复支付入账和并发争用额度。该引擎单连接串行事务，不能替代真实Neon多连接并发或真实供应商验证。

开放前完成样片/计费、Neon迁移/并发、邮箱与Google登录、R2、后台调度、Waffo沙箱，以及经营主体、客服、实际存储政策，再设 `STUDIO_LAUNCH_READY=true` 并重新部署。目前未推送或部署。构建扫描在未配置认证密钥时会提示默认密钥；真实运行必须配置 `BETTER_AUTH_SECRET`。

登录和注册使用首页弹窗，Google 入口置顶。邮箱注册不发送验证邮件，自动建立会话；不要求 emailVerified 才能购买或生成。同邮箱的不同登录方式不自动合并。注册与登录均不赠送积分，找回密码仍通过邮件令牌确认所有权。
