# 已下载的原视频和原音频

用户已确认这些素材的使用授权。来源为 `https://burningbridgesai.app/videos/`，下载时间、原始URL、文件大小与SHA-256记录在 `manifest.json`。

| 场景 | 文件 | 用途 |
|---|---|---|
| 宴会 | `burning-bridges-ai-video.mp4` | 完整20秒参考效果，首页本地播放 |
| 宴会 | `burning-bridges-ai-video.jpg` | 播放器封面 |
| 宴会 | `burning-bridges-ref-1.mp4` | 模型参考第1段，12秒 |
| 宴会 | `burning-bridges-ref-2.mp4` | 模型参考第2段，约8.04秒 |
| 宴会 | `burning-bridges-ref-audio.m4a` | 独立原音轨，约20.03秒 |
| 酒店 | `burning-bridges-after-party.mp4` | 完整20秒参考效果 |
| 酒店 | `burning-bridges-after-party.jpg` | 播放器封面 |
| 酒店 | `burning-bridges-after-party-ref-1.mp4` | 模型参考第1段，13秒 |
| 酒店 | `burning-bridges-after-party-ref-2.mp4` | 模型参考第2段，7秒 |
| 酒店 | `burning-bridges-after-party-ref-audio.m4a` | 独立原音轨，约20秒 |
| 宴会 | `burning-bridges-ref-2-overlap.mp4` | 新任务第二段参考，第一段末尾1秒＋原第二段，约9.04秒 |
| 酒店 | `burning-bridges-after-party-ref-2-overlap.mp4` | 新任务第二段参考，第一段末尾1秒＋原第二段，8秒 |

通过项目本地服务器访问 `/studio/reference/文件名`。文件已随项目保存，无需再次下载。素材来源、大小和SHA-256记录保留在 `manifest.json`，用于核对文件完整性。

当前首页已使用本站文件。模型生成暂时仍引用原公开HTTPS链接，以便在本站尚未上线时用fal测试；fal无法访问本机D盘或localhost。上线后可把生成参考源迁移到本站公开HTTPS路径或R2，再停止依赖原站。

两条重叠参考片由已授权的原始分段素材本地制作，24fps、无音轨，生成方式和SHA-256保存在清单。新网站任务在扣积分前将对应重叠片上传到私有R2的 `studio-inputs/`，签名及清理期限与输入照片一致，为24小时；第一段仍使用原公开链接。重试继续使用任务已保存的同一链接。旧任务保持原参考素材和原合成规则。
