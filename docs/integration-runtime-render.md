# Main 运行时与共享渲染集成

日期：2026-10-21。集成基于 main 的 `958e7631`。初次验收保留了原 main、research/visual-world-model 和 experiment/mineflayer-fabric-render；没有整体搬入研究分支代码，也没有引入 DSH。后续分支收拢与历史保留方式见 [分支说明](branch-consolidation.md)。

## 这轮范围

```text
Brain / 手动 API
       |
SteveXAgent：每个玩家一个 ActionExecutor
       |                         |
Mineflayer 动作与协议状态      captureObservation()
                                 |
AgentManager 的一个 SharedRenderService
                                 |
一个全局 FIFO -> 后台 Fabric -> RGB / 深度 / 独立 NBT
```

每名玩家只由 main 的 SteveXAgent 创建一次。保留 main 的 Mineflayer 4.39.0、寻路、击退及氧气兼容插件；没有移入实验分支的独立玩家创建入口，也没有保留渲染桥的第二套动作 API。

Brain 仍是结构化查询驱动的基础 LLM 命令循环。此次不是 HBT、快慢决策或群体学习算法实现，也没有自动把截图或 NBT 注入模型提示词。视觉已经作为可选观测接口接入，未来策略通过此接口消费，不能声称已完成自主视觉 Agent。

## 生命周期与动作规则

- Brain.stop() 清理定时器、取消在途 fetch，并递增运行代次；即使提供商忽略取消、旧回复晚到，也不会再执行。重新启动时不复活旧代次，不让两轮调度重叠。
- 没有 API Key 时 Brain.start() 返回 false，状态携带明确错误，不会周期性制造无效回复。所有历史分支统一保留最近 10 条。
- 默认不给 Brain 列出 Creative 命令；可用 brain.allowedCommands 显式指定白名单。模型回复必须是单条命令，参数仍由具体命令检查。
- 所有修改世界/控制玩家的命令与视觉采集共用本玩家的 FIFO，最多接收 32 个任务；只读查询不占动作槽，也不把运行状态改成查询名称。
- 手动动作会暂停 Brain，避免其旧计划继续发令。手动查询不会暂停。需要继续自主运行时显式调用 brain/start。
- stop 是紧急控制：不排在长动作后面，立即取消当前及已排队任务、停止 Brain、清除控制键、取消寻路与使用/挖掘。stopdig 仍只针对挖掘任务，不作为全局 stop 的别名。
- move 等待本次移动结束才返回，取消时清理本次定时器；jump、wait 支持取消。move 时长限制 1..30000 毫秒，不能再用非正时长留下永久控制键。
- follow 使用 pathfinder 的动态 GoalFollow，返回 status=RUNNING，表示后台跟随已启动而不是到达。下一条动作或观测替换跟随，目标离开时清理监听；查询不取消跟随。
- 默认动作执行期限 30 秒，可通过 agent.runtime.actionTimeoutMs 配置。超时请求取消，但不是 Promise.race 后直接放行下一动作：旧 handler 必须真正结束，动作槽才释放。
- 自定义/旧技能如果不响应取消，可能停留在 execution.active.cancelling=true。此时运行时会停止物理控制，但保守阻塞后续动作，不能保证第三方 JS 强制中断；必要时断开玩家。主进程关闭最多等待 10 秒，超时以非零状态退出。
- 配置重载串行执行：停止旧玩家、等待队列收尾、解绑旧渲染连接，再建立新配置。重载不会自动重新连接玩家，与原管理界面行为一致；可用 connect API 重新连接。

## 两种运行模式

默认配置 renderer.enabled=false：保持纯 Mineflayer，不启动 Fabric、不建立渲染连接，原 npm start 可用。

共享视觉示例：

```powershell
cd 'C:\Users\roothw\Desktop\code\MC agent\steveX-integration'
npm ci
$env:STEVEX_CONFIG = 'configs/examples/shared-render.json'
npm start
```

STEVEX_CONFIG 指向完整或增量 JSON，仍与 configs/defaults/app.json 合并；agents 数组整体替换。未设置时继续读取原 configs/environments/app.json。API 配置编辑页使用同一个路径。示例没有 API Key，Brain 默认关闭。

另一个 PowerShell 启动唯一的渲染端：

```powershell
cd 'C:\Users\roothw\Desktop\code\MC agent\steveX-integration'
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-24'
npm run mc:renderer -- -Server 127.0.0.1:25565
```

需要可运行 Java 1.21.11 的本机服务器、JDK 21+、Node 22+ 和图形环境。Gradle 自动构建采集 Mod。客户端默认隐藏、禁止聚焦和鼠标捕获，依然使用 GPU，不是无渲染的无头协议客户端。可用 -ShowWindow 显式查看，但仍不能捕获鼠标；-Continuous 仅供连续绘制对照。

渲染玩家 SteveXRenderer 加入后，在服务器控制台配置：

```text
op SteveXRenderer
gamemode spectator SteveXRenderer
```

所有玩家与渲染端必须连同一服务器。renderer.memoryNamespace 必填，重建世界或开始独立实验时换新值；默认纯 Mineflayer 模式不需要此配置。开启共享渲染时最多配置 32 个有效且不重复的 renderer agentId，上限不是实测并发能力。name 不是合法 ASCII 标识时，可以配置 agent.renderer.agentId。

## Main API

Web 面板与 API 默认在 http://127.0.0.1:8090：

| 接口 | 作用 |
|---|---|
| GET /api/status | 原玩家状态，新增 execution 与 brain 状态 |
| POST /api/agents/:name/command | 原命令入口，经过动作仲裁 |
| POST /api/agents/:name/brain/start | 有 Key 且在线时启动/恢复 Brain |
| POST /api/agents/:name/brain/stop | 暂停 Brain 并取消该轮请求/动作 |
| GET /api/renderer/status | 渲染连接、队列与相机/窗口状态；禁用时明确 enabled=false |
| POST /api/agents/:name/observe | 在本玩家动作安全点排队采集；禁用或失败时明确报错 |

```powershell
$r = Invoke-RestMethod -Method Post http://127.0.0.1:8090/api/agents/alpha/observe
$r.observation | ConvertTo-Json -Depth 8
Invoke-RestMethod -Method Post http://127.0.0.1:8090/api/agents/alpha/command `
  -ContentType application/json -Body '{"command":"stop"}'
```

Observation 返回 canonical agentId、agentName、sessionId、会话内 revision、observedAt、sources 和 frame。重连后 revision 从 1 开始，须结合 sessionId/frameId 识别，不是全世界的原子版本号。sources 明确标记 rgb/depth/client-nbt；它们不等同于纯视觉输入。

文件位于 renderer.outputDir/memoryNamespace/agentId 下：PNG、float32-le 深度、帧 JSON。深度是原生非线性深度缓冲，非米；相机矩阵随帧保存。API 返回帧文件名和元数据，不自动向浏览器推送图片，也不增加一套新的 Web 面板。

## 记忆与失败口径

Fabric 复用实验分支 ba4c62d1 的按需绘制、远距离相机重绑、身份校验和独立存储实现。各 agent 的 NBT、累计 union、容器和 sprite 缓存位于：

`vendor/stevex-template-1.21.11/run-renderer/stevex/render/agents/<memoryNamespace>/<agentId>`

owner.properties 校验 UUID、服务器地址与命名空间。后台 union 写盘持有固定路径，不会随当前相机切换写进另一个目录。不会自动把旧 run/stevex/vision 数据合并进来。

采集可能因移动、维度变化、菜单或网络延迟被拒绝，不会静默用别人的画面或旧图冒充成功。每名玩家的动作与采集互斥，其他玩家仍能行动；全局渲染队列一次只服务一名玩家，不能声称同时刻多视角。

取消不能回滚 Java 已写入的 NBT；union 文件也沿用后台延迟保存，不是与 PNG 的原子事务。后续迁移已加入独立 NBT 查询及可选记忆复原调试，详见 [NBT 与复原调试](nbt-memory-debug.md)。复原使用隔离副本，不向正式采集反向写 memory_cells.bin；缺失时仍按原逻辑降级。箱子库存同步、跨维度可靠性和长期压力测试仍未完成。

本机 HTTP 和 Mod WS 无账号认证，只用于受信任的本机实验。没有放宽为公网服务。npm ci 审计报告 6 项 moderate 告警，本轮未执行会升级无关依赖的 audit fix。

## 验收记录

2026-10-21，在隔离服务器 127.0.0.1:25576、main Web/API 8092、隐藏渲染 WS 25550 验证：

- 通过 main 的 npm start 创建 IntegrationA、IntegrationB，未运行实验分支的独立 Node 玩家入口。
- 长 move 后请求 stop，立即返回成功；原 move 与排队 observe 均返回 cancelled=true，之后新的动作和观测正常恢复。
- 无 Key 的 brain/start 返回明确 400，不调用真实 LLM API。Brain 在途停止/重启和 provider 忽略取消的情况由模拟自动测试覆盖。
- alpha→beta→alpha 的 RGB/深度/NBT 采集成功，分别位于 x≈0.5、x≈256.5；同时请求两名玩家也返回各自 UUID 的观测。
- reload 后分别重新 connect，beta→alpha 再次成功，记忆命名空间保持独立。WebSocket 可返回原 snapshot 消息。
- 解析累计 NBT：alpha 为 183 块、x 范围 [-16,16]；beta 为 174 块、x 范围 [240,272]，没有混入对方独有的台阶/蓝墙。
- 空闲观察 5 秒，世界帧数保持 293；windowVisible=false、windowFocused=false、mouseGrabbed=false，全局队列为空。
- 重启 main 后观测带有新的 sessionId；关停时保持 WebSocket 客户端在线，确认连接被正确关闭，没有留下状态广播定时器。
- 最终 Node 自动测试 29/29，Java gradlew build 与 RenderDemand 生命周期检查通过。
- 已关闭本轮 main、隐藏渲染端和隔离服务器，8092、25550、25576 均释放。运行数据在忽略目录 runs/integration-smoke 和 run-renderer 内，未放入源码。

自动测试运行 npm test；Java 检查在采集 Mod 目录运行 gradlew build，包含 RenderDemand 生命周期测试。没有使用付费 LLM API，未修改或启动自用 Minecraft 客户端。

本轮没有验证所有 77 个命令的取消行为、跨维度渲染或长期多玩家压力；不配合取消的技能仍采用保守阻塞策略。对动态世界的事件驱动重规划、观测过期校验、行为图与群体学习留待下一阶段，不能将本轮修复视为完整研究 Agent。
