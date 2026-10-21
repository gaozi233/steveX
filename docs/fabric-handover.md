# SteveX Fabric 开发交接说明

交接日期：2026-10-21。仓库：https://github.com/piggy4/steveX

后续迁移补修见 [迁移核查与修复](research-migration-parity.md)，来源分支 fix/research-migration-parity、目标 main，合并状态以 GitHub PR 为准。补回旧设计资料、隔离玩家状态/开窗记录、共享 API 权限及显式 LiveFeedback；该模式额外启动一个可选记忆客户端，不能与默认单渲染端的资源占用混淆。

当前开发基线为 main，集成已通过 [PR #21](https://github.com/piggy4/steveX/pull/21) 合并，合并提交 b135f10a。以前写的 Fabric 采集、NBT 和记忆复原代码都保留了，没有推倒重写；主要调整是将“玩家行动”和“视觉渲染”拆开，让多个 Mineflayer 玩家共用一个 Fabric 渲染客户端。

## 1. 现在的架构

```text
手动 API / 自研 Brain（基础 LLM 命令循环）
                |
           AgentManager
                |
      多个 SteveXAgent / Mineflayer 玩家
       |                        |
  寻路、移动、交互         请求 captureObservation()
                                |
                SharedRenderService / 全局采集队列
                                |
                 一个 Fabric 旁观者渲染客户端
                                |
                   RGB + 深度 + 每 agent 独立 NBT

已落盘 NBT --> Node 查询 API
已落盘 NBT --> 独立副本 --> 可选的记忆世界复原客户端
```

职责边界：

- Mineflayer 是真实玩家的控制端，负责行动、寻路、交互和协议状态。不要再为每个 agent 启动一个 Fabric 玩家客户端。
- Fabric 是共享观测端，按请求绑定目标玩家 UUID、同步视角、采集画面和记忆，一次只服务一个视角。
- Fabric 空闲时停止世界绘制，但保留网络和客户端 tick；它仍需要图形环境、JVM 和 GPU，不是真正的无渲染无头客户端。
- 记忆世界复原只用于调试，默认不启动，不参与正常 agent 行动，也不向正式采集目录回写反馈。
- 未引入 DSH。Brain 仍是基础结构化状态决策循环，截图/NBT 不会自动进入 LLM；HBT、快慢决策、群体学习尚未实现。

## 2. 迁移了什么

| 原有内容 | 现在的处理 |
|---|---|
| Fabric 采集 Mod、原生深度和对象/NBT 采集 | 已迁入 main，继续维护原模块 |
| 实验分支的 RGB、视角同步、共享渲染、按需绘制 | 已接入 main 的 Mineflayer 玩家，不再另建第二批 bot |
| agent 记忆隔离 | 按命名空间和 agentId 分目录，并校验 owner.properties |
| Node NBT 查询库 | 已迁入，支持实体、地形、方块实体、容器、群系查询 |
| 记忆世界复原 Mod | 已迁入，增加独立副本调试、后台启动及自动验收 |
| main 的 Mineflayer 命令、击退和氧气修复 | 保留；同时修复 Brain 停止/重启、旧回复和动作仲裁 |
| DSH 及其路由插件 | 未引入当前运行代码，历史版本保留在归档标签 |
| Fabric 动作的 Node/Web 透传、Mod Batch、旧控制面板 | 未迁入主运行时；不要用它们绕过 Mineflayer 的动作仲裁。特殊工作站新增 [Mineflayer 等价操作接口](mineflayer-workstations.md)，无需渲染账号代操作 |

采集 Mod 中原有的 Java API 实现仍保留，但不代表每项都已接入新的 Node/Web 入口。不要将渲染旁观者的身体操作当成目标 Mineflayer 玩家的操作。

## 3. 主要代码位置

以下路径均相对仓库根目录。

| 位置 | 职责 / 建议阅读入口 |
|---|---|
| `vendor/stevex-template-1.21.11/` | Fabric 采集 Mod |
| 上述目录的 `src/main/java/name/modid/vision/RenderBridge.java` | 相机绑定、视角切换与采集协调 |
| 同目录 `vision/RenderDemand.java` | 按需绘制状态 |
| 同目录 `vision/DepthCapture.java` | 深度及帧采集 |
| 同目录 `vision/MemoryPaths.java` | 命名空间、agent 目录与所有者校验 |
| 同目录 `vision/VisionCollector.java`、`*Store.java` | 对象采集与 NBT/累计记录落盘 |
| 同目录的上级 `mixin/` | 按需绘制、后台窗口、禁鼠标捕获等注入 |
| `vendor/stevex-test-template-1.21.11/src/main/java/com/example/memworld/` | 记忆复原引擎；入口 MemoryWorldManager，自动验收 DebugVerification |
| `src/render_bridge/service.js`、`bridge.js`、`pool.js` | 共享服务、帧验证/保存、全局排队 |
| `src/mod/client.js` | Node 到 Fabric 的 WebSocket 客户端 |
| `src/nbt/` | JavaScript NBT 读取与查询；agent_memory.js 绑定 agent 目录 |
| `src/agent/agent.js`、`action_executor.js` | 每个 Mineflayer 玩家的动作与采集仲裁 |
| `src/agent/brain.js`、`agent_manager.js` | 基础决策循环及生命周期 |
| `src/web/server/routes.js` | HTTP 入口 |
| `scripts/run-renderer.ps1` | 共享渲染端启动 |
| `scripts/prepare-memory-debug.js`、`run-memory.ps1` | 记忆副本准备、复原启动和验收 |
| `configs/examples/shared-render.json` | 两个 Mineflayer 玩家共享渲染端的配置示例 |

NBT 技术栈：采集端是 Java + Fabric，使用 Minecraft 的 CompoundTag/NbtIo；查询端是 Node.js CommonJS JavaScript，不是 TypeScript、Paper 插件或 Mineflayer 的 NBT API。

## 4. 接手方式和准备

先处理自己尚未提交的改动，避免在脏工作区切换路线。进入自己的仓库根目录后：

```powershell
git fetch origin --tags
git switch main
git pull --ff-only origin main
git switch -c feat/fabric-next
npm ci
```

环境需要 Node.js 22+、JDK 21+、图形环境和一个 Minecraft Java 1.21.11 测试服务器。本机已用 JDK 24 验证。首次 Gradle 构建需要网络，会下载依赖和开发客户端；通常不必手工把本项目 Mod JAR 装入自用启动器。

示例使用 offline 玩家身份，需要相匹配的隔离测试服务器配置，不要把离线测试服务暴露到公网。下面的服务器端口按 25565、Web 8090、Fabric WS 25550 举例；不是一条命令自动创建 Minecraft 服务器。

## 5. 启动共享渲染

先启动 Minecraft 测试服务器，再开两个 PowerShell，均进入仓库根目录。

窗口 A：启动共享 Fabric 渲染端。JAVA_HOME 改成自己机器上的 JDK 路径。

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-24'
npm run mc:renderer -- -Server 127.0.0.1:25565
```

渲染账号加入后，在 Minecraft 服务器控制台执行（不是 PowerShell）：

```text
op SteveXRenderer
gamemode spectator SteveXRenderer
```

窗口 B：启动 main 的两个 Mineflayer 玩家及 API。

```powershell
$env:STEVEX_CONFIG = 'configs/examples/shared-render.json'
npm start
```

示例会创建 alpha/SteveXAlpha 和 beta/SteveXBeta；加上 SteveXRenderer，服务器上应有三个账号，而不是两批重复 bot。Brain 在示例中关闭，不需要付费模型 Key。

默认渲染窗口隐藏、不抢焦点、不捕获鼠标。需要看窗口时加 `-ShowWindow`；不要日常使用 `-Continuous`，它是连续绘制对照模式，会增加负载。STEVEX_CONFIG 是当前终端环境变量，换终端运行记忆调试时要重新设置。

## 6. 先按这个顺序测试

在第三个 PowerShell、仓库根目录执行：

```powershell
$base = 'http://127.0.0.1:8090'
Invoke-RestMethod "$base/api/status"
Invoke-RestMethod "$base/api/renderer/status"
$a = Invoke-RestMethod -Method Post "$base/api/agents/alpha/observe"
$b = Invoke-RestMethod -Method Post "$base/api/agents/beta/observe"
$a2 = Invoke-RestMethod -Method Post "$base/api/agents/alpha/observe"
$a.observation | ConvertTo-Json -Depth 8
$b.observation | ConvertTo-Json -Depth 8
```

验收点：

- 先将两名玩家放到不同可辨认场景，做 alpha → beta → alpha，核对 agentId、UUID、位置、画面和输出目录。
- 同时发起两个观测时应排队，不应串图；不是同一时刻的双视角。
- 空闲几秒再次查看 renderer/status，世界帧计数应停止增长；窗口状态应未聚焦、未抓鼠标。
- 采集与该玩家的动作互斥，但其他玩家仍可行动。部分旧命令不完全支持取消，不能假设全部技能都可强制中断。

查询已采集地形：

```powershell
$body = @{path='terrain'; fields=@('block','pos','dim'); limit=10} | ConvertTo-Json
Invoke-RestMethod -Method Post "$base/api/agents/alpha/nbt/query" `
  -ContentType application/json -Body $body
```

缺失记录应明确报 SOURCE_MISSING，不应伪装成“空箱子”或“世界里没有”。NBT 是历史采集记忆，不是实时全知状态；Mineflayer 开箱后的库存尚未同步到 Fabric 记忆。

## 7. 数据位置和复原调试

RGB/深度/帧元数据默认输出：

`runs/observations/<memoryNamespace>/<agentId>/`

NBT、累计 union 和缓存默认输出：

`vendor/stevex-template-1.21.11/run-renderer/stevex/render/agents/<memoryNamespace>/<agentId>/`

示例命名空间是 local-test-v1。重建世界或开始独立实验时换新命名空间，不要删除 owner.properties 来绕过身份校验。深度为非线性 float32 深度缓冲，不是以米为单位的距离。输出、构建目录和存档被 Git 忽略，不会随 pull 下载；新机器必须自行采集。

已有采集后，暂停采集请求，再在仓库根目录执行：

```powershell
$env:STEVEX_CONFIG = 'configs/examples/shared-render.json'
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-24'
npm run mc:memory -- -Agent alpha
```

默认只准备 `runs/memory-debug/<唯一ID>` 副本，不启动客户端。需要可见的复原调试或隐藏自动验收，分别运行：

```powershell
npm run mc:memory -- -Agent alpha -Launch -ShowWindow
npm run mc:memory -- -Agent alpha -Verify
```

每条命令都新建副本。Verify 会核对当前维度 terrain.nbt 中的方块类型/状态，保存 verification.json、screenshots/verification.png，随后正常退出。复原反馈只写副本的 feedback 目录，不写正式 agent 记忆。复制不是原子快照，复制时不要继续采集。

注意：复原引擎读 terrain.nbt/entities.nbt 等快照及对应分片；NBT 查询可读累计 terrain_union。两者记录数可以不同，当前复原工具不是“一次启动重建全部历史”的 union 重建器。

自动检查：

```powershell
npm test
```

分别进入两个 vendor Mod 的根目录执行 `./gradlew.bat build`（PowerShell 也可用 `.\gradlew.bat build`）。追加迁移补修与工作站接口后，Node 检查 87 项通过，两套 Mod 构建通过；真实工作站交互 13/13 项通过。前轮真实复原 alpha/beta 分别核验 138/164 个快照方块，均无状态差异。跨维度、所有实体/库存、长期多玩家压力尚未完整验收。

停止测试时，在各自启动终端按 Ctrl+C，并确认本次开发客户端退出；不要按 java.exe 名称批量结束进程，以免影响自用客户端。

## 8. 后续开发重点和旧版查阅

建议先复跑上述流程，再按实际需求补：已保存的 Mineflayer 窗口记录与旧容器 NBT 的转换、跨维度切换、远距离切换、掉线重连、多 agent 压力测试。窗口事件隔离保存与特殊工作站操作已补入，见 [工作站 API](mineflayer-workstations.md)。扩展时坚持“每个玩家一条动作队列、所有玩家共享一条渲染队列、每个 agent 独立记忆”。本机 HTTP/WS 没有完整认证，不对公网开放。

旧分支已删除，但原提交、作者和历史通过 main 的合并谱系及以下标签保留：

- `archive/research-visual-world-model-2026-10-21`：原 Fabric 研究版，含旧 DSH 路线。
- `archive/experiment-mineflayer-fabric-render-2026-10-21`：共享渲染实验版。

日常开发基于 main；只需对照旧代码时在 GitHub 切标签。确实要继续旧研究，可从标签新建分支，不要直接在 detached HEAD 上开发，也不要将旧研究分支整体再合回 main。

补充说明：[集成运行与验收](integration-runtime-render.md)、[NBT 与复原调试](nbt-memory-debug.md)、[分支归档策略](branch-consolidation.md)。
