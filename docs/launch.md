# Burning Bridges AI 运行与接入

项目：`D:\逆向\burning-bridges-studio`。模板来源：<https://github.com/cxf37905-max/cxf_template>。Node.js24、pnpm10.33.2、Next.js16 App Router。

## 本地预览

```powershell
pnpm install
pnpm content
pnpm dev --port 3010
```

访问 <http://localhost:3010>。无凭据可浏览首页、选择本地照片、播放参考视频和查看套餐。真实生成与支付由用户手动验收。

## 配置

从 `env.example` 配置 `.env`，保留 `STUDIO_LAUNCH_READY=false`，不要提交密钥。

| 配置 | 用途 |
|---|---|
| `NEXT_PUBLIC_BASE_URL` | 生产 `https://burningbridgesai.cc`；本地 `http://localhost:3010` |
| `DATABASE_URL` | Neon PostgreSQL；迁移前备份现有数据库 |
| `BETTER_AUTH_SECRET` | 模板 BetterAuth 的强随机密钥（至少32字符） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth，回调 `/api/auth/callback/google` |
| `RESEND_API_KEY` | 仅用于找回密码；邮箱注册登录无需邮件服务 |
| `FAL_KEY` | 服务端fal Key，仅单次调用15秒Kling O3 Edit |
| `FFMPEG_PATH` | 可选，本地FFmpeg绝对路径；默认使用依赖自带二进制 |
| `STUDIO_KLING_TIER` | 默认standard，可选pro；用户价格不自动变更 |
| `CRON_SECRET` | 至少32字符，后台调度Bearer鉴权 |
| `STORAGE_ENDPOINT` | Cloudflare R2账号HTTPS端点 |
| `STORAGE_BUCKET_NAME` / `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | 私有R2桶读写凭据 |
| `NEXT_PUBLIC_PAYMENT_PROVIDER` | 当前保持 `waffo`；备用 `dodo`，统一控制新订单、页面和政策中的支付商名称 |
| `WAFFO_MERCHANT_ID` / `WAFFO_PRIVATE_KEY` / `WAFFO_STORE_ID` | 同一测试环境下的商户 ID、完整 RSA PEM 私钥和商店 ID；私钥可用 `\n` 表示换行 |
| `WAFFO_DEBUG` | 测试填 `true`；生产填 `false`。验签公钥由官方 SDK 提供 |
| `NEXT_PUBLIC_WAFFO_PRODUCT_CREDITS_BASIC` | 一次性 USD 产品：$9.90，100 积分，1 个视频 |
| `NEXT_PUBLIC_WAFFO_PRODUCT_CREDITS_STANDARD` | 一次性 USD 产品：$19.90，300 积分，3 个视频 |
| `NEXT_PUBLIC_WAFFO_PRODUCT_CREDITS_PREMIUM` | 一次性 USD 产品：$49.90，900 积分，9 个视频 |
| `NEXT_PUBLIC_WAFFO_PRODUCT_CREDITS_ENTERPRISE` | 一次性 USD 产品：$89.90，1800 积分，18 个视频 |

认证复用模板 Better Auth、用户表与会话，邮箱密码和 Google 登录共用同一账户系统。支付已同步模板 `d49c8a6` 的 Dodo 与共享退款实现，Waffo 继续使用 `@waffo/pancake-ts@0.25.0`，Dodo 使用 `dodopayments@2.54.2`。当前设置 `NEXT_PUBLIC_PAYMENT_PROVIDER=waffo`。在实际使用的支付商测试环境创建四档一次性 USD 产品，金额与币种必须和上表一致。Dodo 备用配置和切换手动验收见 [支付商切换](./payment-provider-switching.md)。

本地测试保留 `NEXT_PUBLIC_BASE_URL=http://localhost:3000`，浏览器继续从 localhost 登录和购买。将 `WAFFO_RETURN_BASE_URL` 设置为 HTTPS 隧道地址，仅在 `WAFFO_DEBUG=true` 时使用；付款后先到隧道的 `/api/studio/checkout/return`，再返回 localhost。Waffo 后台另行配置隧道地址下的 `/api/webhooks/waffo`，订阅 `order.completed` 和 `refund.succeeded`；回调必须能从公网直接访问，不能被部署访问保护拦截。临时隧道停止或更换域名后，需要重新启动并更新支付返回地址及后台回调地址。本地 Google 授权回调仍使用 `http://localhost:3000/api/auth/callback/google`。支付相关变量只放测试环境，修改后重启本地服务或重新部署测试站。正式部署使用实际 HTTPS 网站地址作为 `NEXT_PUBLIC_BASE_URL`，将 `WAFFO_RETURN_BASE_URL` 留空。

## 数据库

支付、余额与流水统一使用模板原有 `payment`、`user_credit` 和 `credit_transaction`，视频任务使用 `studio_video`。业务代码已移除旧 `studio_order` 表定义和读写；历史迁移文件保留，本次不执行删除数据库表或修改数据库数据的操作。模板的付款状态、积分批次和余额在同一事务提交，重复回调不会重复入账。购买积分按 12 个自然月到期，生成失败返还积分沿用原到期时间；支付退款按模板规则收回尚未使用的积分并记录流水。

注册、邮箱登录、Google 登录、免费套餐、订阅及定期分发均不会赠送积分。新用户余额为0，100积分生成一条视频；生成失败只退回原扣除的积分，不退钱、不发放新积分。

```powershell
pnpm db:migrate
```

## 视频生成

模型为fal.ai Kling O3 Edit，单次15秒生成。两个模板均使用各自完整前15秒高清参考片；主体通过elements[0].frontal_image_url引用为@Element1，提示词仅为`Replace the main character in @Video1 with @Element1.`。生成成功后本地FFmpeg加入对应前15秒音轨，存入私有R2；无分段、重叠或拼接流程。

扣100积分、唯一消费流水和任务创建在同一事务。实际提交再次校验消费流水、租约和未退积分。API匹配任务ID的明确终态失败退100积分一次，不退钱、不重生成。未知提交等待回调或查询；只有HTTP发送前明确DNS/连接失败才允许最多额外2次重连，全部确认未发送后退积分。本地下载、音轨处理、保存失败只重做本地处理。详见[kling-testing.md](./kling-testing.md)。

页面每8秒查询；后台 `/api/studio/tasks` 与页面共用180秒租约。没有实际启用调度时，关闭页面后的本站合成步骤在下次查询继续。

首页通过需要本人会话的 `GET /api/studio/videos/current` 恢复最近任务，同时读取任务身份、场景和当前状态/播放入口，不调用生成接口；首次恢复无需再串行查一次状态，未知状态显示播放器框，不能当作生成中。刷新、返回首页或关闭后重新打开时，原任务继续展示与查询；切换 Reference 预览不卸载任务查询，切换场景或照片不清除任务。已提交照片草稿按用户身份绑定，在当前浏览器保留最多24小时；恢复草稿不自动勾选条款、不自动生成。右侧等待状态采用模糊彩色光晕，支持减少动态效果偏好，并提供 My videos 跳转。首页静态标题、正文与结构化数据不受任务恢复影响。

照片去元数据转JPEG，长边最多1536；私有R2输入签名有效24小时，成片访问期限14天。媒体实际删除采用R2原生生命周期：输入前缀 `studio-inputs/` 满1天到期删除，成片前缀 `studio-results/` 满15天到期删除。删除为异步执行，通常在规则到期后24小时内完成，不承诺精确到点删除。必须在生产桶后台单独配置并核对这两条规则，环境变量不会自动创建生命周期。外部定时删除接口已移除；生成回调和后台任务推进仍要求至少32字符的 `CRON_SECRET`。

成片通过需要本人会话的 `/api/studio/videos/[id]/file` 获取新的短时签名（最长5分钟，且不超过剩余保留期），不再向用户交付固定7天链接。14天从任务成功、R2成片上传时起算；访问同时检查任务成功时间与R2对象上传时间，到期返回410。历史任务/账单/积分记录保留，不因文件到期退积分。不清理授权参考素材、头像或其他前缀。桶必须私有，不启用公共访问或绕过此访问入口的缓存。本次只实施本站存储的文件留存。

后台任务推进调用 `/api/studio/tasks`（每分钟），带 `Authorization: Bearer <CRON_SECRET>`；不要在浏览器或公开日志中放密钥。当前 `vercel.json` 未配置调度，目标部署平台须支持所需频率。R2生命周期不依赖该调度；生产桶只配置上述两个前缀的删除规则，不对整个桶设置到期删除。照片签名到期后不会为了重试自动重新上传或增加模型提交。

真实样片由用户人工查看人物一致性、接缝和节拍。部署需可执行 FFmpeg、可写临时目录及120秒路由预算；目标平台重新安装依赖，不复制 Windows 二进制。

## Waffo

创建订单：`POST /api/studio/checkout`；模板通知入口：`POST https://测试站域名/api/webhooks/waffo`。前者从服务端会话读取当前用户，后者校验 `X-Waffo-Signature`，检查商店与测试/生产环境，并主动查单后再确认付款或退款。浏览器付款成功回跳不会直接发放积分。

官方 SDK 验证签名，并检查回调商店、环境、用户、产品和站内支付标识；结账前核对平台产品金额与币种，回调主动查询到真实成功付款后才在事务内发放积分。返回成功页面不会直接发放积分。付款后回首页恢复草稿，由用户再次点击生成；余额不足时提供套餐入口。真实沙箱收款、回调入账和退款由用户手动验收。

## 验证和上线

按用户要求，不运行自动化测试，不代替用户发起付费生成；功能和实际视频由用户手动验收。

开放前完成样片/计费、Neon迁移/并发、邮箱与Google登录、R2、后台调度、Waffo沙箱，以及经营主体、客服、实际存储政策，再设 `STUDIO_LAUNCH_READY=true` 并重新部署。目前未推送或部署。构建扫描在未配置认证密钥时会提示默认密钥；真实运行必须配置 `BETTER_AUTH_SECRET`。

登录和注册使用首页弹窗，Google 入口置顶。邮箱注册不发送验证邮件，自动建立会话；不要求 emailVerified 才能购买或生成。同邮箱的不同登录方式不自动合并。注册与登录均不赠送积分，找回密码仍通过邮件令牌确认所有权。

## 15秒单次生成更新（2026-10-13）

新任务使用两个现有模板各自前15秒的完整720P参考片，单次调用O3；成功后只添加对应15秒原音轨。version=3不走双段重试或拼接，API明确失败退100积分且不再调用模型，未知提交继续等待回调或查询。旧版双段流程与素材已移除。下载使用本人鉴权的`/api/studio/videos/[id]/file?download=1`同源流，失败不跳新页面。
