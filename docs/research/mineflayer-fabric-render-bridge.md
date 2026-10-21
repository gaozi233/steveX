# Mineflayer + Fabric 渲染桥接试验

> 本文保留单玩家原型的历史口径。当前多玩家共享、记忆隔离及默认隐藏启动以 [共享渲染端指南](mineflayer-fabric-render-pool.md) 为准；下文“单目标限制”等内容已被新实现替代。

更新：2026-10-21。分支：`experiment/mineflayer-fabric-render`，基于 `research/visual-world-model`。不修改或合并 `main`、`research/visual-world-model`。

## 本轮实现

### 按需渲染（默认开启）

`npm run render:client` 现在默认启用 `stevex.render.onDemand=true`，仅影响此独立渲染入口，普通 `mc:capture` 不启用。它不是无头模式，而是跳过空闲世界绘制：

- 空闲时保留客户端循环、网络收包、游戏 tick、GPU 异步回调与窗口事件；循环限额为 20Hz，但不绘制世界。F3 的 FPS 是主循环计数，不代表有同样数量的世界渲染帧。
- 请求采集后唤醒绘制，限额 30 FPS，重置相机预热计数，等待至少 20 个匹配目标的世界帧，再执行原来的 RGB/深度/NBT 采集。请求结束或抛错都释放唤醒 scope；嵌套采集不会提前休眠。
- 视角预热在 Fabric 内部完成。Node 不再在发起 capture 之前等待匹配渲染帧，否则空闲状态下会形成互相等待。
- 空闲游戏窗口可能显示黑色，这是跳过世界绘制的结果，不是离线；标题菜单、加载界面和交互菜单仍可绘制，菜单背后的世界也跳过绘制。不要根据窗口黑屏判断采集失败，应检查 `/status` 和生成的 PNG。
- JVM、纹理、区块和网络等资源仍驻留。主循环仍会清理 framebuffer、处理 GPU 任务和更新窗口，不等于 GPU 零工作，也没有降低服务器 tick rate。

`GET /status` 的 `rendererState.rendering` 现在包含 `onDemand`、`idle`、`activeRequests`、`worldFrames`、`skippedRenderCalls` 和 `loopLimit`。验收空闲绘制是否停止，应比较两次 `worldFrames`，而不是观察 F3 FPS。`ready` 只表示当前相机/之前帧计数满足条件，每次采集仍重新预热，不能把旧的 ready 当作新截图已经就绪。

需要调试或做资源对照时，可用连续渲染模式重启：

```powershell
npm run render:client -- -Continuous
```

`-Continuous` 使用原版帧率选项，不强制按需模式的 20/30Hz。默认配置上限是 30 FPS，但旧游戏目录可能保留其他设置。当前仍是一个固定目标的渲染进程，不支持直接切换多个玩家；渲染资源池与记忆隔离另行实现。

```text
HTTP 动作 / 现有 Mineflayer API -> SteveXBot（真正行动的玩家）
                                      |
                           同一个 Minecraft 服务器
                                      |
                      SteveXRenderer（独立旁观者客户端）
                           /spectate SteveXBot 的 UUID
                                      |
             原版世界渲染 -> 同帧 RGB + 深度 + 原有对象/NBT 管线
```

Mineflayer 负责移动、转向；Fabric 负责原版渲染。没有使用 prismarine-viewer，也没有把 Fabric 变成无头客户端。Fabric 仍需要图形环境和 GPU，并占用一个旁观者账号/服务器玩家名额。

这是独立可运行的桥接入口，尚未接入 DSH 自动决策、原 Web 面板或 main 的 AgentManager。不能据此声称已经实现自主行动或多 agent 渲染调度。

### 视角与采集口径

- 通过服务器原生 `/spectate <UUID>` 绑定 Mineflayer 玩家，使用第一人称相机；不是从外部手工估算眼睛位置。
- 在世界渲染结束、手持物和 HUD 绘制之前采集 RGB，与现有深度回读使用同一个世界渲染帧。画面不包含手、准星、背包界面。
- 导出 PNG、`float32 little-endian` 深度和 JSON 元数据。两张图均以左上角为原点，尺寸相同；深度是原生非线性 `[0,1]` 深度缓冲，不是米/方块距离，天空为 1。
- 元数据包含相机 UUID、位置、角度、投影/视图矩阵、时间、维度及原有对象和 store 统计。实际转换距离时需使用同帧矩阵。
- 服务器网络同步和客户端插值仍存在延迟，不是服务器 tick 锁步、不是所有玩家状态的原子快照。桥接串行执行动作/采集，并检查采集前后位姿；不满足误差门限就返回错误。
- 当前门限：水平相机误差 0.5 格，方向误差 3°；采集中玩家位移不超过 0.25 格、转向不超过 1°。目前只验证了静止、转向后及短距离移动后采集。
- Node 端的最终位姿校验发生在原有 NBT 管线之后；被 Node 拒绝的帧不会写入桥接输出目录，但可能已经更新 Fabric 的累计 NBT。当前不能把该累计目录当成只含验收成功帧的严格实验数据集。

### NBT 的边界

复用原有 `VisionApi`、深度对象解析、地形/方块实体/实体/群系记忆存储，没有添加服务器端全量 NBT 扫描。可见箱子的客户端 NBT 不等于箱子库存；Mineflayer 打开容器后获得的窗口物品数据，尚未转接到 Fabric 的容器记忆。旁观者也不等于目标玩家，状态效果、背包、交互界面和权限不能直接视为两者完全一致。

当前一个渲染进程只允许绑定一个目标 UUID/agentId，解绑后仍保留进程内记忆归属。归属没有持久化校验；重启后换玩家、换服务器或换实验世界必须使用全新的游戏数据目录或先备份并清空旧记忆，避免混入前次实验数据。当前启动脚本固定使用 `run-renderer`，没有实现多目标切换或多 agent 的独立记忆命名空间。

## 文件位置

| 文件 | 用途 |
|---|---|
| `src/render_bridge/main.js` | 独立 Mineflayer + HTTP 桥接入口 |
| `src/render_bridge/bridge.js` | 动作队列、视角验证、采集落盘 |
| `configs/render-bridge.example.json` | 服务器、玩家、端口和输出目录配置 |
| `scripts/run-renderer.ps1` | 等待服务器端口后启动独立 Fabric 渲染端 |
| `configs/render-options.txt` | 首次启动渲染端的图形选项 |
| `vendor/stevex-template-1.21.11/src/main/java/name/modid/vision/RenderBridge.java` | 相机绑定、就绪检查和渲染 API |
| `vendor/stevex-template-1.21.11/src/main/java/name/modid/vision/DepthCapture.java` | 同帧颜色/深度回读 |
| `vendor/stevex-template-1.21.11/src/main/java/name/modid/vision/VisionApi.java` | 复用 NBT 管线并导出采集数据 |
| `test/render_bridge/bridge.test.js` | 位姿、隔离、串行采集和关闭回归测试 |

## 启动

以下命令均在本分支工作目录执行：

```powershell
cd 'C:\Users\roothw\Desktop\code\MC agent\steveX-render-bridge'
npm ci
```

需要 Node.js 22+（新增 Mineflayer 依赖的要求）、JDK 21+、可运行原版 1.21.11 的图形环境。测试使用 JDK 24、Fabric Loader 0.19.3。Gradle 自动下载和构建所需依赖，不必向自用客户端的 mods 目录安装 JAR。首次构建需要网络；不需要输入 LLM API Key。

1. 先启动你控制的 Minecraft Java 1.21.11 服务器。默认配置连接 `127.0.0.1:25565`，离线认证仅适合受信任的本机测试服务器，不要将其暴露到公网。正式在线服需要分别为两名玩家配置合法认证，本原型的 Gradle 开发启动没有处理在线账号登录。
2. 在第一个 PowerShell 启动渲染端：

```powershell
npm run render:client
# 自定义服务器和渲染 WebSocket 端口：
# npm run render:client -- -Server 127.0.0.1:25576 -Port 25550
```

脚本在启动前最多等待 60 秒检测服务器 TCP 端口，避免服务器尚未监听时触发 Quick Play 的 `Connection refused`。端口可达不保证登录一定成功；仍需核对服务器版本、账号、白名单等。若连接失败，修复服务器后重新运行；目前不会自动重连游戏服务器。

3. 等待 `SteveXRenderer` 加入后，在服务器控制台执行（没有 `/` 前缀）：

```text
op SteveXRenderer
gamemode spectator SteveXRenderer
```

不要对不信任的共享服务器启用此方案；渲染账号需要操作员权限。保持游戏窗口打开，关闭菜单；后台不暂停，但最小化、驱动节流等行为尚未验证。

4. 在第二个 PowerShell 启动 Mineflayer 和 HTTP 桥接：

```powershell
npm run render:bridge
# 使用另一个 JSON 配置，直接传路径，不带 --config：
# npm run render:bridge -- runs/render-smoke/bridge.json
```

需要换端口或玩家时，先复制示例配置为本地文件再调整。Fabric 和 Mineflayer 必须连接同一服务器。`render:client` 只启动眼睛，不启动服务器或行动玩家；原来的 `start:all` 不会启动本桥接入口。

5. 在第三个 PowerShell 发出测试请求：

```powershell
Invoke-RestMethod http://127.0.0.1:8091/status
Invoke-RestMethod -Method Post http://127.0.0.1:8091/action `
  -ContentType application/json `
  -Body '{"type":"look","yawDegrees":0,"pitchDegrees":10}'
$result = Invoke-RestMethod -Method Post http://127.0.0.1:8091/capture
$result.frame | ConvertTo-Json -Depth 8
Start-Process (Join-Path (Get-Location) ('runs/render-bridge/' + $result.frame.rgb.file))
```

偏航采用原版角度，0° 朝南、90° 朝西；俯仰正数向下。第一次采集自动绑定相机，最长等待就绪约 15 秒。输出在配置的 `outputDir` 下，默认 `runs/render-bridge`，每帧三个同名文件：`.png`、`.depth.f32`、`.json`。

## 接口

HTTP 只监听 `127.0.0.1:8091`，Gradle 的 `runRenderer` 将 Mod WebSocket 限制在 `127.0.0.1:25550`。两者无认证，不要通过反向代理暴露到公网。普通研究分支采集端的默认监听行为保持不变。

| HTTP | 用途 |
|---|---|
| `GET /status` | 玩家在线、渲染 WS 连接、位姿、最近连接错误，以及 rendererState 的 ready/spectator/screenOpen/screenType/matchingFrames/rendering；WS 已连接不等于游戏已进入或相机已就绪 |
| `POST /action` | `look` 或 `move`，与采集共用串行队列 |
| `POST /capture` | 检查/绑定相机、采集并写 PNG/深度/JSON，失败返回 `{ok:false,error}` |
| `POST /stop` | 立即清除当前 Mineflayer 控制键；不撤销已经排队的其他动作 |
| `GET /artifacts/<filename>` | 读取本地输出文件 |

`move` 示例：`{"type":"move","control":"forward","durationMs":250}`。支持 forward/back/left/right/jump/sneak/sprint，每次 1..5000 毫秒。它是原始控制键，不是路径规划或复合技能。按 Ctrl+C 关闭桥接会清除按键，取消尚未开始的队列操作，等待在途采集结束，再解绑相机并退出。

新增 Mod WS 方法：`render/bind`（`targetUuid,agentId`）、`render/status`、`render/capture`、`render/unbind`。使用现有 `{id,method,params}` 封装，内层也可能返回 `ok:false`。原来的 `vision/snapshot` 保持兼容，不默认回传大幅 RGB/深度数据。

## 人工验收

1. 服务器控制台 `list` 应看到两名玩家。`GET /status` 应为 `online:true`、`rendererConnected:true`。
2. 在 Mineflayer 玩家附近摆放台阶、半砖、栅栏、玻璃，转向后采集。确认 PNG 不为空、方块模型正确、无 HUD，JSON 中 targetUuid 与 cameraUuid 一致。
3. 转向 90° 再采集，确认画面随玩家改变；短暂 `move` 后停下再采集，确认相机位置同步。不要手工操纵渲染端转动视角。
4. `.depth.f32` 大小应为 `width * height * 4`；读取时用小端 float32。检查非全 1 的场景深度，以及元数据 alignment。不要把深度数值直接当距离。
5. 放置可见箱子并采集，确认 blockEntities 中包含箱子和状态，`run-renderer/stevex/vision` 的 `.nbt` 更新。箱子库存、Mineflayer 窗口同步不是本轮验收项。
6. 取消渲染账号的 spectator 模式、打开菜单或断开游戏后采集，应返回就绪/同步错误，不应返回看似有效的 RGB 文件。恢复状态后重启桥接/渲染端再测；绑定错误玩家不支持自动切换。
7. 关闭桥接、渲染端、测试服务器，确认端口释放。清理前先保留测试图像和 JSON。

NBT 数据在 `vendor/stevex-template-1.21.11/run-renderer/stevex/vision`，采集端临时 RGB 在 `run-renderer/stevex/render/rgb`。记忆复原客户端仍默认读取旧的 `run/stevex/vision`，本轮没有自动切换它；如需查看此原型的 NBT，须另配 memory.json 的 sourceFile/terrainFile/entityFile/memoryCellsFile 等路径，不要误以为其默认展示的就是新数据。复原端兼容性尚未验收。

## 本机测试记录

### 按需渲染增量验收

2026-10-21，新循环实机验证：

- 初次空闲 `worldFrames=0`，玩家在线；第一次按需采集成功，960×540，约 3.02 秒。第二次约 2.27 秒；空闲期间服务器放置的新金块出现在第二次截图中，确认并非复用缓存画面。
- 第一次采集后观察约 5.05 秒，`worldFrames` 从 37 保持为 37，activeRequests=0，玩家保持在线；此段渲染 Java 进程累计 CPU 增量约 0.141 秒、工作集约 992 MiB。这不是与连续渲染的受控性能对照，不能据此宣称节省百分比，也未测量 GPU/显存占用。
- 发现并修复菜单漏绘：只跳过 GameRenderer.render 的正常游戏路径还不够，菜单会继续绘制世界背景；增加 renderLevel 的空闲拦截后，主动打开 ChatScreen 观察 5 秒，worldFrames 始终为 0。
- 修复菜单路径后的版本再次按需采集成功（约 2.53 秒，文件 `bf465e78-1c4b-46f5-9ad8-ee96d6ef5774.png`）；请求结束后菜单打开时观察 5 秒，worldFrames 从 32 保持为 32。
- 错误路径：取消渲染端旁观模式后采集返回明确错误，随后 activeRequests=0、idle=true，没有遗留唤醒 scope。

可自行检查（需要测试进程正在运行）：

```powershell
$a = (Invoke-RestMethod http://127.0.0.1:8091/status).rendererState.rendering
Start-Sleep -Seconds 5
$b = (Invoke-RestMethod http://127.0.0.1:8091/status).rendererState.rendering
$a
$b
```

期间不要请求截图。worldFrames 应不增长；请求截图后增长一小段，再停止。此开关只在项目的开发渲染客户端启用，不会修改其他自用 Minecraft 客户端。

2026-10-21，在隔离服务器 `127.0.0.1:25576`、桥接 HTTP 8091、渲染 WS 25550 上完成：

- 960×540 RGB/深度采集成功，首帧 467,062 个非天空像素，识别 183 个可见方块；台阶、半砖、栅栏和玻璃画面已人工检查。
- 0°、90° 转向后均采集成功，图片 SHA-256 不同；首帧水平误差 0，俯仰误差约 0.206°。
- 向前移动 250 毫秒后采集成功，稳定后的水平误差约 0.0000026 格。
- 放置箱子后采集到 1 个方块实体，NBT 含坐标与箱子 ID，无库存信息；原有 terrain/entities/block_entities/biomes 记忆文件生成。
- 每帧深度文件 2,073,600 字节（960×540×4）。截图保留于本地忽略目录 `runs/render-smoke/captures`，不纳入 Git。
- Java `gradlew build` 成功；原有 Node 回归测试 66/66，桥接专项测试增加到 8/8；新增不依赖 JUnit 的 Java demand scope 生命周期检查，随 `build` 执行，也可运行 `gradlew testRenderDemand`。没有开展多 agent 上限、长期稳定性、跨维度、药水效果视效或容器同步测试。
- 最后一次重启验证了 WS 仅监听 127.0.0.1；将渲染端改为创造模式时明确拒绝采集，恢复旁观但仍有菜单打开时也拒绝采集。这一轮未新增成功帧，前述成功记录来自之前的实机采集。
- 联调结束后已关闭本次桥接进程和开发渲染端，并对测试服务器执行 stop 保存退出；8091、25550、25576 均已释放。开发渲染端被主动终止，Gradle 的 runRenderer 因此显示非零退出，不是 Java build 编译失败。

安装时 npm audit 报告 19 项依赖告警（18 moderate、1 critical），包括间接依赖 proxy-addr。未执行可能升级无关依赖的 audit fix；当前入口默认不启用 trust proxy，且只供本机测试。公开部署前需另行处理依赖审计和认证。

## 后续工作

先接入现有 Mineflayer 技能/Agent 调度，建立明确的观测接口；再决定渲染资源池、跨世界/跨 agent 的持久化记忆隔离、容器窗口同步和批量采样调度。不能把当前的一对一原型直接作为多 agent 高并发方案，也不能把 NBT 辅助观测当成纯视觉基线。
