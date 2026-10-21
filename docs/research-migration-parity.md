# Research 迁移核查与修复

日期：2026-10-21。修复来源分支：fix/research-migration-parity，目标分支 main。对照归档 research d9ccd626，不将“保留源码”“可调用”“端到端验收”混为一谈。合并状态以 GitHub PR 为准，本文记录能力与验收边界。

## 已确认的源码保留

PR21 合并时，旧采集端的 58 个 Java 文件全部保留（43 个原样、15 个共享渲染适配），旧复原端的 22 个 Java 文件全部保留（19 个原样、3 个调试适配），Node NBT 的 6 个旧文件全部原样保留。

本轮补回相关设计文档、tools 下的分析脚本、NBT 演示脚本、原生方法 schema 目录及 PR14 观察边界回归。文档保留原文以便追溯，描述的是原生 Fabric 单玩家路线，不自动构成当前共享模式的功能承诺；当前行为以本文及新运行指南为准。DSH 代码、路由插件、旧 Mod Batch 和第二套玩家运行时不恢复。

运行 `node scripts/audit-research-migration.js` 可检查旧 Java、NBT 和分析工具是否有文件遗漏。它只检查存在性，不证明语义等价。

## 历史能力与当前状态

| 旧工作 | 当前代码 / 处理 | 验收口径 |
|---|---|---|
| PR13 半透明减量、复原稳定性与批处理清理 | DeletionJudge、DepthCapture、MemoryWorldManager 等保留；旧批处理退出主运行时 | 构建通过；不是所有透明材质都重做动态回归 |
| PR14 观察边界、实体属性、药水效果 | VisionEntityStore、LivingSummary、EffectSampler、EntityRestorer 保留；恢复原回归测试 | 三项源代码边界回归通过，非完整实体场景验收 |
| 非完整形状、sprite alpha、信号缺失与实体在场纠正 | 原裁决器、几何与表结构保留 | 默认缺反馈时仍只增不删；显式 LiveFeedback 恢复原反馈生产流程 |
| 容器拖拽、交易、附魔、织布机、信标、药水组件、合成器禁用位 | 原 Java 保留；新增 Mineflayer 工作站操作及窗口属性适配，见 [工作站 API](mineflayer-workstations.md) | 目标玩家交互由 Mineflayer 执行；共享渲染账号仍禁止执行。尚无完整配方／图案枚举及旧 NBT 无损转换 |
| 玩家/F3/库存/声音等原生查询 | 原 Java 保留，但共享模式不再透传 | 新 state 接口取 Mineflayer；声音/原生 GUI 的目标玩家等价适配未实现，不伪装支持 |
| 群系、维度、传送门冻结与展示实体复原 | 原复原类保留 | 复原主世界验收通过；跨维与所有展示实体未完整复测 |
| PR16 区域分片与 union、重启认领等 | 原各 Store 与 restorer 保留，采集路径改为独立 agent 上下文 | NBT 库及隔离测试通过 |
| PR17 空索引传播 | 原 VisionRegions 与复原索引处理保留 | 原修复代码保留；不宣称本轮穷举了所有删除场景 |
| PR18 NBT 查询及一致性修复 | src/nbt 保留，任务缓存/缺失分片等原测试保留 | 自动查询测试及 demo 通过；DSH router 不迁入 |

## 本轮修复的身份边界

共享渲染模式由 runRenderer 的 background 标志或已绑定相机判定。Mod WS 只允许 status、render/bind、render/status、render/capture、render/unbind；player、inventory、key/*、container/*、旧 vision/* 等拒绝，防止以渲染账号的数据/动作冒充目标玩家，也防止绕过采集队列切换记忆。未进入共享模式的原生开发客户端保留旧方法。

Mod WS 默认绑定 127.0.0.1。渲染账号的 GUI 容器跟踪在共享模式下关闭，不能把管理员误开的箱子写成目标 agent 的经验。原生模式仍保留 ContainerMemoryTracker。

新接口：

- `GET /api/agents/:name/state`：来自指定 Mineflayer 的 UUID、生命、食物、氧气、位置、库存等，标记 mineflayer-protocol；离线不回旧值冒充实时。
- `GET /api/agents/:name/memory/containers`：指定玩家实际打开的窗口记录，标记 mineflayer-window，含 actorUuid、维度、时间、目标和窗口本地槽位。
- `GET /api/commands` 与 `window` / `station`：发现命令、查询当前窗口，以及操作特殊工作站。打开窗口时 state/inventory 使用窗口背包区域，修正独立背包缓存滞后。

通过 openBlock/openEntity 真实调用绑定目标，不用渲染端准星猜测。支持既有 openContainer/openFurnace/openVillager 等通过这两个入口打开的窗口；无绑定来源的服务端窗口标记 unknown，不猜坐标。背包区域不纳入容器记录，观察到的空槽保留 null，物品 components/NBT 保留，BigInt 编成十进制字符串。

窗口记录是 Mineflayer 的窗口缓存，可能含客户端预测，不是服务端交易确认日志。双箱保持 54 槽窗口整体，不猜分半；炉子、交易、附魔等也保存窗口布局，不将结果槽误当普通箱子。此数据独立于旧 Java 容器 NBT，不能声称已经无损转成旧 ItemStack.CODEC 格式并支持库存回放。

每个 session 的记录独立落到 `runs/interaction-memory/<namespace>/<agentId>/<sessionId>.json`，最多保留 256 个窗口目标的最新记录；断连清理监听、排空写盘，未自动读取其他会话。持久化失败通过 lastError 暴露。后续如做跨会话经验加载或 NBT 转换，必须校验世界身份并补组件/双箱等专项测试。

## 原记忆反馈模式

普通 `mc:memory` 仍复制快照，绝不向正式源回写。需要恢复旧反馈闭环时显式运行：

```powershell
$env:STEVEX_CONFIG = 'configs/examples/shared-render.json'
npm run mc:memory -- -Agent alpha -Launch -LiveFeedback
```

它增加一个可选的记忆客户端，读取 alpha 的实时源，复原后把 memory_cells.bin / memory_sprites.bin 写回 alpha 的同一独立目录。原有 DeletionJudge 等在下一次 capture 时可以读取它们。每个 writer 只绑定一个 agent，不能用一个 alpha 反馈生产者冒充所有 agent；多 agent 全量开启会增加 JVM/GPU 开销。默认的“一个共享渲染端”不变，但默认不保证完整减量闭环。

writer 的 JVM 使用文件锁，防止同一 agent 被两个复原进程同时写反馈；即便启动 PowerShell 退出，锁也由 writer 进程持有至退出。源 owner.properties 的 SHA256 固定在启动配置中，每次服务端恢复 tick 检查，变化/不可读时停止恢复及反馈。仍须为新世界选择新命名空间。该保护不构成跨文件原子事务，也不能抵御外部进程无视锁直接改文件。

`npm run mc:memory -- -Agent alpha -Verify -LiveFeedback` 可隐藏验收并自动退出。除方块状态和窗口状态外，还检查本次启动后反馈文件确实更新、所有者仍匹配。render/status 和采集帧新增 memoryFeedback，明确表示反馈文件是否存在；存在不代表解析有效或当前维的全部删除证据已就绪。

目前未实现“只用一个渲染客户端就独立产生全部原版模型几何反馈”。不通过临时伪造空 cells、复制别的 agent 的文件或绕过 spriteEpoch 来声称完成。

## 测试和未完成验证

自动检查覆盖：原 NBT、PR14 边界、窗口/玩家隔离、槽位与组件保存、离线 API、任务清理、原生/共享方法权限、反馈 writer 互斥、显式反馈配置。运行 npm test 和两套 gradlew build。实际反馈冒烟使用独立复制的测试数据，未改原来 integration 工作目录的采集文件。

实际 Mineflayer 开箱已验收：隔离服务器 25576，beta 打开 (256,64,4) 的箱子，正确记录 27 槽、槽 0 的 3 个钻石和 beta UUID；alpha 没有该窗口记录；关闭后磁盘记录一致。测试服务器已正常保存退出。组件保留、空槽、背包排除及监听清理另由模拟窗口回归覆盖。

实际反馈验收：alpha 复原 138 块，反馈含 126 main、9 translucent、3 shaped；beta 复原 164 块，反馈含 163 main、1 signalLoss。beta 的报告 feedbackFresh=true、feedbackOwnerValid=true，窗口隐藏且未聚焦/抓鼠标；各自写不同目录。两次反馈生产客户端均正常退出。无几何 sprite 时可以没有 memory_sprites.bin，不能据此伪造有几何反馈。

前轮 Node 检查 76 项通过；两套 Java 构建通过，含原按需绘制生命周期、共享 API 边界和反馈 writer 锁回归；NBT demo 运行通过。追加工作站 API 后 Node 检查 87 项通过，真实交互 13/13 项通过，详见 [工作站验收记录](mineflayer-workstations.md)。运行数据在忽略目录 runs/parity-smoke、runs/memory-debug、runs/interaction-memory、runs/workstations-smoke，不随源码提交。初次真实开箱脚本将 entity.uuid 当作唯一 UUID 来源导致断言失败，修正为兼容 entity.uuid/player.uuid 后重跑通过，运行代码本来已包含此兼容。

尚需专项验收：真实物品组件变更、双箱/末影箱/药水等的旧 NBT 无损转换、动态删块后的深度裁决全过程、跨维与长期压力。不能把这些未验证或未实现项写为“research 全功能等价迁移完成”。
