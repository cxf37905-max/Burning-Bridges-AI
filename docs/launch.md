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

本地测试保留 `NEXT_PUBLIC_BASE_URL=http://localhost:3000`，浏览器继续从 localhost 登录和购买。将 `WAFFO_RETURN_BASE_URL` 设置为 HTTPS 隧道地址，仅在 `WAFFO_DEBUG=true` 时使用；付款后先到隧道的 `/api/studio/checkout/return`，再返回 localhost。Waffo 后台另行配置隧道地址下的 `/api/webhooks/waffo`，订阅 `order.completed` 和 `refund.succeeded`；回调必须能从公网直接访问，不能被部署访问保护拦截。临时隧道停止或更换域名后，需要重新启动并更新支付返回地址及后台回调地址。本地 Google 授权回调仍使用 `http://localhost:3000/api/auth/callback/google`。支付相关变量只放测试环境，修改后重启本地服务或重新部署测试站。正式部署使用实际 HTTPS 网站地址作为 `NEXT_PUBLIC_BASE_URL`，将 `WAFFO_RETURN_BASE_URL` 留空。

## 数据库

支付、余额与流水统一使用模板原有 `payment`、`user_credit` 和 `credit_transaction`，视频任务使用 `studio_video`。业务代码已移除旧 `studio_order` 表定义和读写；历史迁移文件保留，本次不执行删除数据库表或修改数据库数据的操作。模板的付款状态、积分批次和余额在同一事务提交，重复回调不会重复入账。购买积分按 12 个自然月到期，生成失败返还积分沿用原到期时间；支付退款按模板规则收回尚未使用的积分并记录流水。

注册、邮箱登录、Google 登录、免费套餐、订阅及定期分发均不会赠送积分。新用户余额为0，100积分生成一条视频；生成失败只退回原扣除的积分，不退钱、不发放新积分。

```powershell
pnpm db:migrate
```

## 视频生成

模型为fal.ai Kling O3 Edit。宴会参考片12秒+约8.04秒；酒店13秒+7秒。同一照片分别配两段原片，提示词只保留 `Replace the main character in @Video1 with the main character in @Image1.`（将原视频主角替换为照片中的主角），不附加服装、背景或动作指令。两段成功后，服务端本地FFmpeg按模板720p/24fps配置拼接并加原音轨，上传私有R2后交付。不调用fal合成接口，不进行本地成片验收或元数据检查。用户已确认原视频和音频授权。

两套完整参考效果、四段模型参考视频、两条原音轨及两张封面，已真实下载到 `public/studio/reference/`，附原始URL、大小和SHA-256清单。首页从本站读取视频与封面。模型暂用已验证的原公网素材URL；本站上线后可迁移到本站或R2的公网HTTPS路径。详见素材目录的 `README.md`。

新任务另有两条本地制作的重叠参考片：宴会第二段约9.04秒，酒店第二段8秒，均在原第二段前加入第一段末尾24帧。创建任务前检查 FFmpeg、原音轨和重叠片，将重叠片上传私有R2（与照片同为24小时输入），成功后才事务扣100积分并提交两段模型。任务 `seam` 字段保存第二段签名链接和24帧重叠量；后续重生成使用同一已保存链接。无需新增环境变量或数据库迁移。

带 `seam` 的任务合成时解码为24fps低分辨率RGB帧，在重叠区比较同一时刻的颜色、画面边缘、跨切点差异和局部运动变化，中央画面权重更高。选择分数最低的切点，第一段裁掉末尾 `24-k` 帧，第二段裁掉开头 `k` 帧，总共恰好去掉24帧重复内容；原音轨连续播放，不做叠化或补帧。选点信息记录在服务端 `studio.video.seam` 日志。两段独立生成仍可能出现外观或动作漂移，低分辨率差异评分不是人物识别或骨骼姿态识别，不能保证视觉无痕。无 `seam` 的旧任务不裁剪；分析、下载、转码或上传失败均沿用本地合成重试，不重发模型或退积分。解码每段15秒预算，转码60秒预算；新重叠素材比原方案多约1秒模型输入，费用按供应商实际计费与取整规则。

一次父任务事务创建、扣100积分并写唯一消费流水。照片、重叠素材和本地依赖准备失败不扣积分、不调用模型。每次模型提交前再次查验本人video消费流水、金额、租约和未退积分状态。两段都明确API失败，直接退回100积分；一段成功则保留成功段，只重生成明确失败段，最多额外2次，累计三次明确失败后退回100积分。所有返还均为站内积分，不向支付商发起退钱。退积分与任务终止在同一事务提交，匹配当前租约与完整任务快照，重复查询不会重复返还。两段成功后的下载、选切点、拼接或保存失败只重试本地处理，不重调模型或退积分。

网站每次模型提交都配置fal官方完成回调，并在提交前保存submissionId。回调入口为POST /api/webhooks/fal，验证本站上下文HMAC、fal官方Ed25519签名（原始请求体、时间戳±5分钟、官方JWKS），再用本站FAL_KEY查询同一request_id确认归属和最终状态。提交响应丢失时，回调自动恢复原任务ID；成功继续处理，明确ERROR记录失败证据并按现有规则重试或退积分。旧提交的迟到回调、已结束任务和重复回调不会覆盖当前结果。回调只落库，不在回调请求里重新生成、合成或返还积分；后续页面查询或调度推进处理。官方密钥缓存1小时，轮换时刷新；租约忙时返回503，由fal重投递同一个回调。

本地配置FAL_WEBHOOK_BASE_URL为现有公网HTTPS隧道，保留NEXT_PUBLIC_BASE_URL=http://localhost:3000；正式HTTPS站点可省略前者。没有公网回调地址时不开放生成。隧道或服务停止会影响回调接收，需保持运行。回调未到达不能证明模型没生成；没有request_id时无法仅凭普通超时或账单暂时无记录证明未计费。

仅Node fetch明确报告请求发送前的ENOTFOUND、EAI_AGAIN、ECONNREFUSED或UND_ERR_CONNECT_TIMEOUT时串行重试连接，最多额外2次；每次证据保存错误代码和时间。三次均未发送成功后，其他分段已结束或未提交则事务退回100积分，其他分段仍在运行或提交身份未知则先等待结果。普通ETIMEDOUT、ECONNRESET、HTTP错误和缺少视频地址不作为未发送或未计费证据。这是对本次请求未发送的传输层判断，不是读取供应商实时账单后证明未计费。详见[kling-testing.md](./kling-testing.md)。

页面每8秒查询；后台 `/api/studio/tasks` 与页面共用180秒租约。没有实际启用调度时，关闭页面后的本站合成步骤在下次查询继续。

首页通过需要本人会话的 `GET /api/studio/videos/current` 恢复最近任务，仅读取任务身份与场景，不调用生成接口。刷新、返回首页或关闭后重新打开时，原任务继续展示与查询；切换 Reference 预览不卸载任务查询，切换场景或照片不清除任务。已提交照片草稿按用户身份绑定，在当前浏览器保留最多24小时；恢复草稿不自动勾选条款、不自动生成。右侧等待状态采用模糊彩色光晕，支持减少动态效果偏好，并提供 My videos 跳转。首页静态标题、正文与结构化数据不受任务恢复影响。

照片去元数据转JPEG，长边最多1536；私有R2输入签名有效24小时。`/api/studio/cleanup` 每小时扫描 `studio-inputs/` 和 `studio-results/`，按R2对象实际上传时间删除满24小时的照片和满14天的成片，含未成功建立数据库任务的过期照片。清理失败会让调度请求失败，下一次调度继续；调度正常时通常在到期后的1小时内删除。生成服务要求配置至少32字符的 `CRON_SECRET`；配置密钥不等于调度已生效，上线必须实际验证清理执行。

成片通过需要本人会话的 `/api/studio/videos/[id]/file` 获取新的短时签名（最长5分钟，且不超过剩余保留期），不再向用户交付固定7天链接。14天从任务成功、R2成片上传时起算；访问同时检查任务成功时间与R2对象上传时间，到期返回410。历史任务/账单/积分记录保留，不因文件到期退积分。不清理授权参考素材、头像或其他前缀。桶必须私有，不启用公共访问或绕过此访问入口的缓存。本次只实施本站存储的文件留存。

上线需R2凭据拥有目标桶的列举、读、写、删对象权限，并部署 `vercel.json` 两项调度。非Vercel平台调用 `/api/studio/tasks`（每分钟）和 `/api/studio/cleanup`（每小时），均带 `Authorization: Bearer <CRON_SECRET>`；不要在浏览器或公开日志中放密钥。Vercel计划须支持这些频率。首次生产验收用已过期的测试对象确认真实删除，并确认新对象、其他前缀不受影响；本地模拟测试不证明生产调度已运行。照片到期后不会为了重试自动重新上传或增加模型提交。

真实样片由用户人工查看人物一致性、接缝和节拍。部署需可执行 FFmpeg、可写临时目录及120秒路由预算；目标平台重新安装依赖，不复制 Windows 二进制。

## Waffo

创建订单：`POST /api/studio/checkout`；模板通知入口：`POST https://测试站域名/api/webhooks/waffo`。前者从服务端会话读取当前用户，后者校验 `X-Waffo-Signature`，检查商店与测试/生产环境，并主动查单后再确认付款或退款。浏览器付款成功回跳不会直接发放积分。

官方 SDK 验证签名，并检查回调商店、环境、用户、产品和站内支付标识；结账前核对平台产品金额与币种，回调主动查询到真实成功付款后才在事务内发放积分。返回成功页面不会直接发放积分。付款后回首页恢复草稿，由用户再次点击生成；余额不足时提供套餐入口。真实沙箱收款、回调入账和退款由用户手动验收。

## 验证和上线

按用户要求，不运行自动化测试，不代替用户发起付费生成；功能和实际视频由用户手动验收。

开放前完成样片/计费、Neon迁移/并发、邮箱与Google登录、R2、后台调度、Waffo沙箱，以及经营主体、客服、实际存储政策，再设 `STUDIO_LAUNCH_READY=true` 并重新部署。目前未推送或部署。构建扫描在未配置认证密钥时会提示默认密钥；真实运行必须配置 `BETTER_AUTH_SECRET`。

登录和注册使用首页弹窗，Google 入口置顶。邮箱注册不发送验证邮件，自动建立会话；不要求 emailVerified 才能购买或生成。同邮箱的不同登录方式不自动合并。注册与登录均不赠送积分，找回密码仍通过邮件令牌确认所有权。
