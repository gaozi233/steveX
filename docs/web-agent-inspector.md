# Web 视角与 LLM 调试

每张 agent 卡片新增 **View** 和 **LLM Input / Output**，与只读背包并列。不是视频流，也不会打开面板就调用模型。

## 视角

- View 展示当前会话最后一张成功截图；Capture 手动调用现有 observe 接口，仍经过动作仲裁、共享 Fabric 队列及视角／UUID／维度校验。采集会按既有逻辑停止移动以稳定视角，并非纯旁观操作。
- 图片旁显示采集时间、尺寸、维度和角度。失败保留上一张，并明确标记 Previous snapshot；无图、离线、禁用、渲染端断开均单独展示。
- 渲染仍为单个隐藏、无焦点、按需 Fabric 客户端。RGB、深度、NBT 原采集路径不改，网页只提供 RGB 预览。
- 服务端按 agent／session 记录最新文件，只接受当前 frameId；RGB 路由不接收任意路径。断线、重连、重载后的旧图片不可继续请求。

## LLM 记录

- Brain 在真实 chat 调用前记录实际 system/user messages，返回后按 requestId 配对 assistant content，另记录模型、状态、耗时、所选命令和失败／取消。
- 这是当前 DeepSeekClient 返回的文本，不包含供应商完整 HTTP 原文、隐藏推理或未提供的 token／费用信息。responded 不代表命令已成功完成。
- 每 agent 最近10次，单次输入合计和输出各最多128Ki字符；截断会显示警告。限制只作用于调试展示，不修改发给模型的内容。
- system/user 分开折叠；长内容可滚动查看，不沿用旧日志弹窗的2000字符展示截断。
- 记录只在内存，不写提示词文件；刷新页面可恢复同一后台会话，重启服务后不保留。断线／换 session 后不展示旧记录。
- 已知配置／运行时 Key、常见 token、Bearer 和密码字段在记录前脱敏。不是通用个人信息匿名化；提示词仍可能含聊天、任务等私人内容，只在可信本机查看。

## HTTP 与资源

- `GET /api/agents/:name/debug`：当前会话快照、渲染可用状态、最新图片元数据、近期请求；支持 ETag/304。
- `GET /api/agents/:name/observation/:frameId/rgb`：仅当前 agent/session 最新 RGB。
- `POST /api/agents/:name/observe`：保留原响应，新增 `preview`，供网页定位该截图。
- 仅人工／后台使用，不加入 Brain 默认目录。共享渲染／HTTP 本身不因此获得新的 LLM 权限。
- 面板展开才以1秒间隔读取调试状态；同一卡片共享轮询，折叠／移除后清理请求。不会自动采集视角、自动启动 Brain 或新增周期模型调用。
- 服务仍无新增用户鉴权，脱敏不等于可以公网公开。维持 loopback 监听。

## 安全启动实际模型

已有 DPAPI 文件位于本地忽略目录；不要把 Key 写入配置或命令参数。目标 agent 的 llm 可使用 `"apiKeyEnv":"DEEPSEEK_API_KEY"`，仅显式设置的 agent 从进程环境取值。

```powershell
powershell -NoProfile -File scripts/start-web-panel-secure.ps1 -Config runs/web-inspector-dev/agent.json
```

脚本仅在启动时把 DPAPI 密钥解密到环境变量，并在结束时恢复环境、释放安全字符串。是否启动 Brain 仍由配置／人工操作决定。默认示例 Brain 关闭；调用真实模型需用户授权及预算。

验收结果与当前限制见 [视角与 LLM 调试验收](api-validation/web-inspector-validation.md)。
