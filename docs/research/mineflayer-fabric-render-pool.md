# 多 Mineflayer 玩家共享 Fabric 渲染端

更新：2026-10-21。工作分支仍为 `experiment/mineflayer-fabric-render`，不合并或修改 main / research 分支。

## 结构

一个 Node 桥接进程创建多个 Mineflayer 玩家，连接一个 Fabric 旁观者。每个玩家自己的动作/采集按序执行，不同玩家可以同时行动；所有截图共用一个 FIFO 队列。队列任务覆盖绑定视角、预热、RGB/深度/NBT 采集、校验和文件写入，不能在任务中途换到另一个玩家。

仍然是按需绘制：空闲跳过世界渲染，请求时短暂唤醒。一次只能采集一名玩家，不是多个玩家同一服务器 tick 的同步截图。其他玩家不会因为渲染端切换而暂停行动。并行截图请求会排队，延迟随排队长度增长。

## 不打扰桌面

开发渲染端默认隐藏窗口，并在 GLFW 创建窗口前设置不获取焦点、不在显示时抢焦点；同时拦截 Minecraft 的鼠标捕获。不会依靠“先抢焦点、再释放鼠标”的补救流程。普通 `mc:capture` 和用户自用客户端不受影响。

```powershell
cd 'C:\Users\roothw\Desktop\code\MC agent\steveX-render-bridge'
npm run render:client
# 需要查看窗口时显式显示；仍禁止捕获鼠标：
# npm run render:client -- -ShowWindow
```

隐藏的是窗口，不是无图形计算的 Mineflayer；仍需要 GPU、OpenGL 和客户端资源。启动/资源加载期间仍会产生负载。`-ShowWindow` 模式不能用鼠标正常操纵视角，这是对独立渲染端的刻意限制，控制和诊断应使用 API。

## 启动多个玩家

先启动本机 Minecraft Java 1.21.11 测试服务器，再启动一个渲染端。渲染账号 `SteveXRenderer` 加入后，服务器控制台执行：

```text
op SteveXRenderer
gamemode spectator SteveXRenderer
```

另一个 PowerShell 启动共享桥接：

```powershell
npm run render:bridge -- configs/render-pool.example.json
```

示例创建 `SteveXBotA`、`SteveXBotB`。三名玩家连接同一服务器，默认 localhost:25565；自定义端口时同时修改配置并为 render:client 传 `-Server 127.0.0.1:<port>`。账号名不能重复，也不能占用渲染账号。离线登录示例只适合受信任的本机服务器，不应公开部署。

最多配置 32 名玩家；这是本原型的内存上下文保护上限，不是实测并发能力承诺。每个玩家队列最多容纳 8 个任务，共享渲染队列最多 32 个任务，超限明确报错。

## 请求示例

```powershell
Invoke-RestMethod http://127.0.0.1:8091/status
Invoke-RestMethod -Method Post http://127.0.0.1:8091/agents/agent-a/action `
  -ContentType application/json `
  -Body '{"type":"look","yawDegrees":0,"pitchDegrees":10}'
$a = Invoke-RestMethod -Method Post http://127.0.0.1:8091/agents/agent-a/capture
$b = Invoke-RestMethod -Method Post http://127.0.0.1:8091/agents/agent-b/capture
Invoke-RestMethod -Method Post http://127.0.0.1:8091/agents/agent-a/capture
```

`GET /agents/<id>/status` 查询单玩家；`POST /agents/<id>/stop` 清除该玩家按键，`POST /stop` 清除所有玩家按键，但不撤销已经排队的未来动作。Ctrl+C 会取消尚未执行的任务，等待在途采集完成再退出。

旧的单玩家配置继续可用，未指定 memoryNamespace 时使用 `default`。只有一名玩家时保留 `/capture`、`/action`、`/artifacts`；多名玩家时 `/capture`、`/action` 必须在 JSON 中提供 agentId，或改用上述明确的路径。未知 agentId 不会创建新玩家或隐式回退到第一名。

## 记忆隔离

必须为每个实验世界指定稳定的 `memoryNamespace`，示例为 `local-test-v1`。重建世界或开展独立实验时换新值，不要复用旧实验的记忆。

```text
<gameDir>/stevex/render/agents/<memoryNamespace>/<agentId>/
  owner.properties       # namespace、agentId、玩家 UUID、服务器地址
  terrain.nbt
  entities.nbt
  terrain_union/         # 本 agent 的累计地形分片
  entities_union/        # 本 agent 的累计实体分片
  block_entities/
  containers/
  biomes/
  memory_cells.bin       # 可选：只能由对应 agent 的复原端写入
  memory_sprites.bin     # 可选：与本 agent 的几何反向缓存配套
  rgb/                   # 此 agent 的原始颜色回读
```

具体文件按采集内容按需创建。除了路径分开，地形/实体/方块实体/群系/容器/累计观测和 sprite 表的内存镜像也按根目录分别持有；切回 A 不会清掉 A 的累计观测，也不会把 B 的内存内容并进去。后台累计写盘线程共用一个，但各 store 的文件路径在实例创建时已固定，切换目标不会改变后台任务的写入地址。

owner.properties 在重启后继续检查身份，防止同一个 namespace/agentId 绑定不同 UUID 或服务器；身份不一致直接拒绝，不会自动迁移或合并。它无法识别“同一地址、同一账号，但服务器世界已重建”，这由 memoryNamespace 的实验管理约定负责。

Node 输出位于 `<outputDir>/<memoryNamespace>/<agentId>/`，每帧为同名 PNG、depth.f32、JSON。JSON 包含 agentId、targetUuid、cameraUuid、memoryNamespace 和 memoryDirectory；任一身份或相机位姿不匹配就拒绝交付。

累计 union 文件沿用原有后台限频保存机制，可能比本帧 JSON 晚数秒更新；目录隔离不等于所有文件同时原子提交。不要强杀仍有未保存数据的渲染进程，也不要在截图刚返回时就假设所有 union 分片已同步到磁盘。

切换相机与记忆在 Java 的同一采集锁下执行，`render/capture` 还必须携带与当前绑定一致的 `targetUuid,agentId,memoryNamespace`，避免外部请求改了绑定后误采另一名玩家。远距离目标实体可能晚于 camera 包抵达；预热时等待目标加载，必要时重新绑定，超时不落盘为有效帧。

隔离是观测数据的逻辑隔离，不是安全权限隔离：本机 HTTP 没有用户认证，能访问桥接的人仍能读取各 agent 的 artifacts。原版渲染端会收到其他位置的区块，不应把客户端持有的全量区块直接作为某个 agent 的可见记忆。

## 边界

- 原有 NBT 管线的“只处理当前视角”口径保持不变。Mineflayer 打开箱子后的库存同步仍未实现，不能把渲染端旁观者的背包和药水效果等同于目标玩家。
- 每次采集前后仍检查 UUID、维度、位置与角度；持续移动或被其他玩家推动时可能报错，需要重试。当前跨维度切换尚未验收，不能承诺可用。
- Node 最终拒绝的帧可能已更新 Java NBT，这一原型尚无跨 PNG/NBT 的事务回滚。
- 普通 vision/query/容器等 Mod 管理 API 反映当前选中的上下文，不是已封装的多 agent 查询 API。多 agent 消费者应读取各自固定目录，不要把“当前渲染上下文”当作固定某名玩家。
- 记忆复原端默认仍读旧目录；若需复原，必须为每名 agent 单独配置其 NBT 和反向缓存路径，不能让多个复原端向同一个 memory_cells.bin 写数据。
- 内存缓存随已打开的 agent 数增加，目前没有上下文淘汰机制。仅减少 Fabric JVM、图形资源和持续渲染的重复成本，不代表内存总量与玩家数无关。

## 验收方法

1. 把 A、B 放在相距超过渲染视距的两处，各放一个独有物体，例如 A 处台阶，B 处蓝色墙。
2. 请求 A→B→A，核对两处画面、UUID、相机位置和 memoryNamespace。
3. 同时请求两名玩家截图，确认每帧仍属于请求者，目录没有混写。
4. 解析两名玩家的 terrain_union 与 block_entities，确认 B 的独有观测未进入 A；切回 A 后，A 的累计内容应保留。
5. 关闭再重启渲染进程，重复采集，验证独立记忆继续加载；更改 owner 对应的 UUID 或 namespace 参数，错误请求应被拒绝。
6. 查询 `/status`，应看到 windowVisible=false、windowFocused=false、mouseGrabbed=false；空闲时 worldFrames 不增长，网络仍在线。

自动测试：`npm run test:render` 检查共享队列完整临界区、输出身份、错误恢复、背压和配置路径校验；Java `gradlew build` 含 demand 生命周期检查。实机验收结果另记于本文末尾。

## 实机结果

2026-10-21，隔离测试服务器 127.0.0.1:25576，一个隐藏的 Fabric 渲染进程、两个 Mineflayer 玩家，namespace 为 pool-smoke-v1：

- A 位于 (0.5,64,0.5)，B 位于 (256.5,64,0.5)。截图分别出现 A 的台阶/半砖/栅栏/玻璃、B 的蓝墙/箱子；960×540，水平相机误差均为 0。
- 发现并修复远距离切换 camera 包先于目标实体加载的问题。修复后 A→B→A 成功，并行发出的 A、B、A 三个 HTTP 请求也全部返回对应 UUID、位置与独立文件。
- 解析累计 NBT：A 有 183 个累计地形块，x 范围 [-16,16]，不含 B 的 blue_wool；B 有 174 块，x 范围 [240,272]，不含 A 的 oak_stairs。不是仅检查文件夹名称。
- 关闭并重启 Fabric 和 Node 桥接后，再请求 B→A 成功；日志分别确认加载 B 的 174 块、A 的 183 块累计观测，B 的箱子方块实体也从其目录加载。
- 错误绑定 B 的 UUID 到 agent-a 被 owner 校验拒绝；绑定为 A 时请求 B 的 capture 身份也被拒绝。
- 空闲观察 5 秒，世界帧数保持 246；windowVisible=false、windowFocused=false、mouseGrabbed=false，两名玩家在线，共享队列清空。
- 原有 Node 测试 66/66、桥接/共享队列测试 11/11、Java 构建与 demand 生命周期检查通过。未验证跨维度、32 名玩家压力、所有容器类型或长期持续运行。

本地 PNG/深度/JSON 位于 `runs/render-smoke/pool-captures/pool-smoke-v1/<agentId>`，NBT 位于开发游戏目录 `run-renderer/stevex/render/agents/pool-smoke-v1/<agentId>`。这些运行数据均在 Git 忽略目录中。

验收结束后已关闭本轮两个 Mineflayer 玩家、隐藏渲染客户端及隔离服务器，8091、25550、25576 端口均已释放。实现维护在 experiment/mineflayer-fabric-render 分支，未合并到 main/research，自用客户端没有改动。
