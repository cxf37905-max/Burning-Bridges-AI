# Kling O3 Edit 真实样片测试

项目：`D:\逆向\burning-bridges-studio`。独立测试只用一个 fal Key 和自己的照片，无需先配置网站登录、数据库、R2、Turnstile 或 Waffo。

## 获取 Key

1. 注册并登录 [fal.ai](https://fal.ai/)。
2. 在 [API Keys](https://fal.ai/dashboard/keys) 创建可调用模型的 Key，并按控制台提示补充可用余额。
3. 在项目 `.env.local` 填写 `FAL_KEY`，保留 `STUDIO_KLING_TIER="standard"`。不要把 Key 发到聊天或写入前端变量。

```dotenv
FAL_KEY="在本机填写你的Key"
STUDIO_KLING_TIER="standard"
```

模型为 [Kling O3 Edit Standard](https://fal.ai/models/fal-ai/kling-video/o3/standard/video-to-video/edit/api)。Key 只调用两段模型生成；拼接和加音频使用服务端本地 FFmpeg，不调用 fal 合成或元数据接口。`pnpm install` 会安装当前操作系统的 FFmpeg 二进制，可用 `FFMPEG_PATH` 指定已有程序。

此前核对的 Standard 公开价格每生成秒约 $0.126，20秒模型部分约 $2.52；Pro 约 $0.168/秒，20秒约 $3.36。当前单价、分段计费时长、取整、重试费用和失败计费以控制台账单为准。本站退回生成次数，不表示 fal 也退回上游费用。

## 执行

在项目目录运行。照片至少341×341，JPG/PNG/WebP，不超过20MB，单人正脸清晰。

```powershell
pnpm test:video --photo "C:\你的照片\me.jpg" --dry-run
pnpm test:video --photo "C:\你的照片\me.jpg" --scene chandelier
```

第一条只校验输入参数与照片；第二条启动付费生成。完成后打开输出的 `preview.html` 播放完整视频和两个分段。酒店场景使用 `--scene after-hours`。

流程：照片去元数据/转JPEG → 上传fal → 同一照片分别配两段原视频提交模型 → 本地 FFmpeg 按模板配置拼接并加原音轨 → 保存 `finished.mp4`。预览页面读取同目录成片；状态里的 `https://local-test.invalid/finished.mp4` 仅为独立脚本的完成标记，不是线上资源。网站成片上传私有 R2。没有本地时长、比例、帧率、分辨率或音轨验收；接口返回值仍需解析合法视频地址。参考视频和音轨来自用户已确认授权的对标公开素材。

两段使用相同人物照片、相同服装保留规则和连续原片；不默认叠化，避免重影与节拍偏移。**不能保证接缝完全无痕，需播放真实样片检查。**

## 中断后恢复

每个上游request_id立即保存到 `.local/kling-tests/<测试ID>/state.json`。中断或等待结束，恢复原状态：

```powershell
pnpm test:video --resume "D:\逆向\burning-bridges-studio\.local\kling-tests\测试ID\state.json"
```

不要重新用 `--photo` 重试同一任务，这会另建付费任务。锁文件防止两个本地进程同时恢复；强制退出可能留下 `.lock`，确认旧进程退出后才删除锁。

提交超时或进程恰在提交期间退出，会标记unknown并停止重发。先在fal历史按时间、模型与照片核对确切请求ID，再绑定：

```powershell
pnpm test:video --resume "绝对路径\state.json" --recover-step segment-1 --request-id "控制台核对的UUID"
```

无法核对身份时保留状态供人工处理，不凭超时推断失败。

## 网站账单和后台

网站按一条视频扣1次，分段和合成不另扣。照片先准备到R2，准备失败时尚未扣次数、未调用fal，可重试同一提交。R2 SDK最多尝试两次；页面保留同一个提交ID供再次提交。照片成功后，任务创建与扣次数在同一事务；同一请求绑定同一照片/场景。

每次判定模型失败，必须取得与已存步骤 request_id、模型 endpoint 一致的 fal 最终失败响应：status 为 COMPLETED，且明确含非空 error 或 error_type。失败证据逐次保存到对应分段的 failures。

| 结果 | 处理 |
|---|---|
| 两段都明确失败 | 不重试，退回1次 |
| 一段失败，另一段仍在生成 | 等待另一段结果，不退款、不重试 |
| 一段成功，另一段明确失败 | 保留成功段，只重试失败段，最多额外2次 |
| 重试正在排队或生成 | 只查当前 request_id，不并行发起下一次重试 |
| 失败段的两次重试也都明确失败 | 保存三次不同 request_id 的失败证据，退回1次 |
| 两段成功，本地拼接、加音频或保存失败 | 下次查询/调度只重试本地合成，不退次数、不重新调用模型 |
| HTTP错误、断网、超时、缺少结果链接 | 不作为模型失败证据；查询可重查，提交身份未知需人工核对 |

退款事务匹配完整的已持久化 pipeline 快照和当前租约，并原子标记 refunded_at、返还1次。重复请求不能再次退款。成功分段及失败重试可能仍产生供应商成本。以上重试/退款规则是用户指定的本站后端政策，不能由对标公开前端证实。

拿到fal任务ID后只查询该次任务；只有该次明确失败且满足上述重试条件，才提交下一次。已发出提交但没有拿到ID时停止自动重发，先核对供应商历史；此时不能认定未提交。符合退款条件后在结果区域显示英文失败与次数已回到账户的提示；只有退款事务提交完成后API才返回refunded=true，页面刷新服务端余额，不发邮件。

部署需 Node.js 运行时、可执行 FFmpeg、可写临时目录和足够的执行时间；当前路由预算120秒，转码子进程60秒超时，任务租约180秒。原音轨读取项目 `public/studio/reference/` 已下载文件。Next.js 配置追踪 FFmpeg 二进制和这两条原音轨。应在目标 Linux 平台重新安装依赖，不能直接复制 Windows 的 node_modules。成片 R2 签名链接有效7天，未承诺永久保存；输入照片签名24小时。

任务每8秒刷新并更新服务端余额；登录/付款后恢复照片草稿，重新确认条款，不自动生成。等待中可主动创建另一条，旧任务在视频库。

后台 `GET /api/studio/tasks` 使用 `Authorization: Bearer <CRON_SECRET>`，密钥至少32字符。`vercel.json` 配置每分钟运行，须在生产真正启用。Vercel每分钟Cron需要Pro/Enterprise，Hobby只支持每日，见[官方限制](https://vercel.com/docs/cron-jobs/usage-and-pricing)。其他平台可移除Vercel的crons字段，用外部调度器每分钟带鉴权调用。后台与页面共用任务租约。

脚本不经过站内钱包或支付。网站完整联调还需 [launch.md](./launch.md) 的配置和数据库迁移；目前未对真实Neon、Waffo沙箱或fal做付费实测。测试文件使用独立内存PostgreSQL。
