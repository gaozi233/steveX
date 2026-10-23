# Web 视角与 LLM 输入输出验收

2026-10-23。源码入口及边界见 [Web 调试](../web-agent-inspector.md)。原始截图及运行记录仅在忽略目录 `runs/web-inspector-dev`、`runs/web-inspector-smoke`，不上传。

## 已完成

- 视角初轮全库自动回归 **456/456**；后续任务输入及固定英文system调整后的最终回归 **465/465**。源码差异空白检查通过。
- `test/agent_debug.test.js`：实际 messages／返回配对、错误与取消、明确配置的环境 Key、脱敏、条数／字符限制、旧 session 拒绝、HTTP 条件响应、RGB 身份／路径隔离。
- `test/agent_inspector_ui.test.js`：长上下文保留、输入角色折叠、纯文本转义、显式截断提示。
- `scripts/web-inspector-smoke.js`：renderer/provider fixture，不冒充实机。覆盖手动采集、失败保留上一帧、无自动采集／模型调用、完整角色内容、错误脱敏、双 agent、刷新恢复、换 session 清空及桌面／390px布局。
- `scripts/web-inspector-live.js`：真实双 Mineflayer 与隐藏 Fabric，A→B→A三次RGB；每帧960×540、agent身份对应、错误角色图片URL返回404。
- 实机确认渲染窗口 hidden=true、focused=false、mouseGrabbed=false、onDemand=true，采集后 idle=true。
- 同一实机脚本还通过实际 DeepSeekClient 的HTTP请求到**本地模拟服务**，一次 pos 请求，system/user与网页记录逐项一致、响应 pos、A无B记录。没有付费模型调用，不将其称为 DeepSeek 模型能力测试。

## 当前实际模型状态

用户手动通过安全脚本重启后，完成 **1 次真实 DeepSeek 调用**：Web-B 使用 `deepseek-v4-flash`，994ms 返回 `inventory slots`。实际 system/user 输入共4061字符，输入输出均未截断；Edge 已显示对应输入、原始返回和选中的命令。Web-A 无模型记录，Web-B Brain 已停止，未持续调用。

诊断响应未发现常见 Key 格式；Key 仍通过 DPAPI／进程环境加载，不写入配置或验收记录。核验摘要保存在忽略目录 `runs/web-inspector-dev/deepseek-check.json`。本次仅验收调试显示链路，不作为复杂任务能力或命令执行成功率测试；客户端未提供 token／费用数据，不估算费用。上述本地模拟调用与本次真实模型调用分开计数。

## 边界

- 截图不是连续实时视频，采集时间会显示；失败保留图有旧图标记。
- 未对所有移动中截图、低TPS、渲染进程崩溃、超长队列做实机穷举；仍沿用桥接层拒绝不稳定视角的策略。
- 记录保存在当前后台进程内，重启不恢复。单条字符上限与最近10条保留会显式提示；记录不是无限日志或完整供应商响应归档。
- 脱敏为已知 Key／常见格式防护，不承诺隐藏全部私人内容；无新增多用户权限系统。
- 测试不会上传图像到模型；没有自动附加位置／生命／背包／视角到 Brain 的改动。
