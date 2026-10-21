# NBT 查询与记忆复原调试

日期：2026-10-21。迁移最初在 `integration/agent-runtime-shared-render` 完成，后续分支收拢见 [分支说明](branch-consolidation.md)。未引入 DSH、Fabric 动作透传、Mod Batch 或第二套玩家控制链路。

## API 分层

- Java + Fabric 客户端 Mod 使用 Minecraft 的 `CompoundTag`、`NbtIo` 等采集并写入 NBT；不是 Paper 服务端插件。
- `src/nbt/` 是从 research 分支迁移的 Node.js CommonJS JavaScript 查询库，自己读取 gzip/zlib/裸 NBT，保留 modified UTF-8、数据源结构检查、过滤、字段投影、结果上限与版本检查。不是 TypeScript 或 Mineflayer 的 NBT API。
- Mineflayer 继续拥有玩家、行动和协议状态。查询不创建玩家、不切换相机、不要求渲染客户端当前在线，也不会自动注入 Brain。
- NBT 是采集记忆，不是实时世界真值，更不等于纯视觉输入。容器记录缺失时不推断箱子为空；Mineflayer 开箱后的库存尚未同步到 Fabric 记忆。

## 每个 Agent 的查询

默认采集根目录：

`vendor/stevex-template-1.21.11/run-renderer/stevex/render/agents/<memoryNamespace>/<agentId>`

命名空间来自 `renderer.memoryNamespace`，agentId 来自 `agent.renderer.agentId` 或配置名。读取前检查 `owner.properties`，不接受请求提供文件路径，不回退到旧的 `run/stevex/vision` 目录。自定义采集游戏目录时，在配置中设置 `renderer.gameDir`；这是 Node 文件读取目录，不会替你改变 Java 启动目录，两者必须一致。

新增 `POST /api/agents/:name/nbt/query`。指定配置中的 agent，即使当前未连接玩家，也可查询已落盘记录；renderer 配置仍需 enabled=true。响应含 agentId、uuid、memoryNamespace、sourceVersion、matchedCount、result，source 为 `captured-client-nbt`。

```powershell
$body = @{path='terrain'; fields=@('block','pos','dim'); limit=10} | ConvertTo-Json
Invoke-RestMethod -Method Post http://127.0.0.1:8090/api/agents/alpha/nbt/query `
  -ContentType application/json -Body $body
```

| path | 数据源与语义 |
|---|---|
| terrain | `terrain_union/`，累计观察到的地形 |
| entities | `entities_union.nbt`，累计实体记录 |
| block_entities | `block_entities/`，方块实体记录 |
| containers | `containers/`，已记录的容器内容与可选末影箱桶 |
| biomes | `biomes/`，群系记录 |

字段支持嵌套路径；filters 多键为 AND，例如 `{"block":"minecraft:oak_stairs"}`。limit 默认 64，最大 512。缺失源返回 SOURCE_MISSING，损坏源返回 SOURCE_CORRUPT，更新中不一致返回 SOURCE_UNSTABLE，不伪装成空结果。数据是否存在取决于实际采集，不能保证每个目录都有所有五种源。

HTTP 每次请求使用新查询实例，结束即清缓存，不提供可无限累积的 HTTP taskId。源码调用可使用 `createAgentNbtApi({memoryNamespace,agentId,gameDir})`，通过 `query(params,{taskId})` 固定同任务、同数据源快照，并在任务结束后 `releaseTask(taskId)`，运行时关闭后 `clearCache()`。

sourceVersion 是对应数据源的文件版本检查结果，不是整个世界的原子版本或采集时间；跨五个源没有事务一致性保证。查询超时预算作用于内存筛选，不是整个磁盘读取/解压过程的硬期限。只用于受信任本机实验，大量历史数据需另做读取预算和性能评估。

## 可选记忆复原

保留 research 的 `vendor/stevex-test-template-1.21.11/`，仍使用原 Java 复原引擎，不作为运行 Agent 的底座。默认不会启动它，也不增加常驻客户端。

```powershell
cd 'C:\Users\roothw\Desktop\code\MC agent\steveX-integration'
$env:STEVEX_CONFIG = 'configs/examples/shared-render.json'
npm run mc:memory -- -Agent alpha
```

默认仅准备副本，打印 `runs/memory-debug/<唯一ID>`。输入目录必须已有该 agent 的采集数据。复制前建议暂停所有采集请求，避免跨文件复制期间的版本变化；复制不是原子快照，source.json 中明确记录 snapshotAtomic=false。

每次使用全新的游戏目录和空白记忆世界，不复用别的 agent 的存档。只复制 NBT 相关文件和目录，不复制 RGB 图片及旧反馈文件。配置明确绑定副本路径，memory_cells.bin / memory_sprites.bin 只写调试目录的 feedback 子目录，removalEnabled=false，不反向影响正式采集。复制失败的半成品不能视为有效交付。

需要查看时显式启动：

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-24'
npm run mc:memory -- -Agent alpha -Launch -ShowWindow
```

该命令重新准备一份新副本后启动。无 ShowWindow 时窗口隐藏；两种模式均设置不抢焦点、禁止自动抓鼠标，默认 30 FPS、无声音。进程在前台 PowerShell 中运行，结束调试按 Ctrl+C；不要误关自用 Minecraft。该工具仍有 JVM/GPU/本地集成服务器开销，不是无渲染的无头模式。

快照调试配置使用 snapshotDebug=true：首次进入后显式限制视距 8、模拟距离 5、30 FPS，避免 Minecraft 首次运行自动提高视距；缺失可选分片目录时不逐秒重复输出配置警告，也不回退到别的源。

自动运行验收可用 `npm run mc:memory -- -Agent alpha -Verify`。这会启动隐藏客户端，进入世界后等待 200 个就绪 tick，在服务器线程逐一核对当前维 terrain.nbt 中的方块类型和状态，并保存 `verification.json` 与 `screenshots/verification.png`，随后请求客户端正常退出。报告同时记录窗口可见性、焦点、鼠标捕获、视距和帧率限制。校验失败或报告缺失时脚本报错；超时预算 180 秒从客户端初始化开始计算，Gradle 下载和 JVM 启动时间不含在内。该验收没有覆盖所有实体、容器内容或其他维度。

保留旧复原引擎的数据语义：地形/实体读副本里的 `terrain.nbt`、`entities.nbt`，方块实体/容器/群系读各自分片目录。它不是新写的累计 union 离线重建器，不能保证一次启动就重现所有历史累计地形。NBT 查询则可以读取累计 union。原引擎仍仅支持 vanilla 三维；本轮未验证跨维度和长期恢复。

## 验收

- `npm test`：68 项通过（含迁入测试辅助文件的发现条目），覆盖原 NBT 查询、所有者校验、agent 隔离、HTTP 参数错误/禁用、查询新版本、调试副本与反馈隔离。
- 复原 Mod 的 `gradlew build` 成功；未新增 npm 包，未引入 DSH。
- 使用上一轮真实 alpha/beta 文件查询，分别获得 183/174 个地形记录。
- `run-memory.ps1 -Agent alpha` 已成功生成真实数据的独立副本。
- 后续隐藏客户端运行验收已完成：alpha 的当前 terrain.nbt 为 138 个方块，beta 为 164 个，逐一核对方块类型及状态，均 0 个不匹配。它们不是累计 terrain_union 的 183/174 条；不能把最新帧复原称为全历史记忆重建。
- 两次报告均为 windowVisible=false、windowFocused=false、mouseGrabbed=false、renderDistance=8、simulationDistance=5、maxFps=30。已查看两张实际截图，alpha 为台阶/玻璃/栅栏场景，beta 为蓝墙/箱子场景，画面非空且不同。
- 两份副本各核对 10 个源文件，字节内容与正式采集文件相同，未向正式目录写入 memory_cells.bin。客户端和集成服务器均正常保存退出，没有残留本轮 Minecraft 进程。
- 自动报告和截图位于忽略目录：alpha 为 runs/memory-debug/01607eb5-a63b-472f-85d2-414463bcc7a6，beta 为 runs/memory-debug/0ff73c8c-e8ff-4148-adcf-f210821d4816。每个目录含 verification.json 和 screenshots/verification.png。
- 运行日志中的 Realms 离线开发账号认证错误未影响本地记忆世界验收；缺失容器目录仍保留低频提示，不伪造箱子库存。早期探测进程曾人工终止，Gradle 相应报告非零退出；后续两次 Verify 均正常退出并 BUILD SUCCESSFUL。
- 上述运行验收时尚未提交或合并；后续发布与归档以 Git 历史及 branch-consolidation.md 的策略为准。合并前新增 Brain 自发 stop 回归后，Node 检查总数为 69，均通过。
