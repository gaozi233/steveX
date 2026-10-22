# API 分类清单与人工验收台账

更新：2026-10-22。核对基线：main / `afce14c9`（PR #23）。范围：**77 个命令（58 action、13 query、6 creative），15 个 HTTP 路由模板**。本文件只记录已实现入口和已有证据，不承诺所有参数、环境和异常分支已验证。旧 Fabric 原生方法目录不计入此清单。

## 1. 如何使用与状态含义

- **实测 B**：基础交互真实世界记录；**实测 W**：工作站独立服务器记录；**实测 M**：共享渲染／记忆迁移记录。表示列明的路径通过，不等于所有变体通过。
- **人工确认**：用户明确确认过视觉结果，目前左右挥手属于这一类。其余即使有人旁观，也不代替人工签字。
- **自动局部**：mock、参数、生命周期或协议适配回归覆盖，不能替代真实游戏测试。
- **待测试**：未找到对应成功路径的专项实测证据；**风险**：源码语义或实现值得优先复核。
- 每一行末列是下一项人工检查，不因单次 `ok:true` 自动完成。验收后在该行追加日期、执行人、日志路径和剩余边界。
- 历史状态截止上述日期。全库 92/92 自动检查通过，不能换算成“79 个命令全部通过”。本次整理没有重新驱动 agent 或修改世界。

### 证据来源

| 编号 | 文档／测试 | 已知范围 |
| --- | --- | --- |
| B | [基础交互与氧气验收](basic-interaction-validation.md)；`scripts/basic-live-smoke.js`、`scripts/oxygen-observe.js` | 两轮各 10 组基础检查，氧气另有 113 个样本；左右挥手人工确认；氧气尚无同 tick 服务端逐点对照 |
| W | [工作站 API 与验收](mineflayer-workstations.md)；`test/workstations.test.js` | 13 项真实交互；部分原生封装、参数及协议确认有自动测试；不含所有配方和效果组合 |
| M | [迁移核查](research-migration-parity.md)、[集成运行](integration-runtime-render.md)、[NBT 调试](nbt-memory-debug.md) | 真实开箱、alpha/beta 隔离复原与反馈、前轮共享渲染验收；跨维度和长期压力未完整验证 |
| A | `test/commands.test.js`、`test/action_executor.test.js`、`test/velocity_compat.test.js`、`test/interaction_memory.test.js` | 参数拒绝、部分原生方法调用、停止与仲裁、状态隔离；不是游戏成功率评测 |
| H | `test/player_state_routes.test.js`、`test/agent_memory.test.js`、`test/manager_lifecycle.test.js`、`test/render_service.test.js`、`test/brain.test.js` | 本地 HTTP／生命周期／渲染模拟和记忆夹具；逐路由是否有真实成功证据见 HTTP 表 |

运行数据位于忽略目录 `runs/`，不随 Git 提交。文档保留验收摘要；换机器后不能假定这些本地 JSON 文件仍存在。

## 2. 统一调用方式

面板地址默认 `http://127.0.0.1:8090/`；实际以配置为准。在 agent 的命令输入框输入表中命令，或调用统一 HTTP 入口：

```powershell
$base = 'http://127.0.0.1:8090'
$agent = 'manual-test' # 配置中的 name，不是游戏 username SteveX-Test

# 只读状态，推荐同时记录作为验收依据
Invoke-RestMethod "$base/api/agents/$agent/state"

# 所有下表命令均通过同一个入口，替换 command 即可
Invoke-RestMethod "$base/api/agents/$agent/command" -Method Post `
  -ContentType 'application/json' -Body (@{command='look 0 0'} | ConvertTo-Json)

# 发现当前运行版本的命令，不保证全部有完整参数 schema
Invoke-RestMethod "$base/api/commands"
```

JSON 请求例：`{"command":"move forward 150"}`。`<参数>` 必填，`[参数]` 可选，尖括号／方括号不要原样输入。命令首词不区分大小写，后续参数按各 handler 实现解释。解析器按空白拆分，**不支持通用引号转义、分号多命令或 JSON 具名参数**；每个请求只执行一条命令。不要假定 `/api/skills` 的局部 schema 已覆盖全部 77 个命令。

### 通用约束

- 坐标为 Minecraft 世界坐标，单位格；`look` 使用弧度，不是角度；`move` 使用毫秒；`wait` 使用客户端 physicsTick，不是墙钟秒数。
- 方块／物品优先使用 registry 名如 `oak_log`；部分旧命令只做子串匹配，名称相近时可能选错，逐行见表。
- 开窗后槽位采用**当前窗口编号**；先查询 `window`，以 `inventoryStart`、`inventoryEnd` 和 `slots` 为准。不要把未开窗的 9..44 编号直接套进箱子／工作站。装备及副手结果中的槽号始终属于玩家窗口，不是任意容器槽位转换器。
- query 命令不暂停 Brain；手动 action 会停止 Brain 调度，并经每个 agent 的动作队列串行执行。测试前仍应显式关 Brain。
- `stop` 直接取消活动／排队动作并停止 Brain；`stand` 是普通排队 action，不是同等的紧急中断。`stopdig` 仅针对活动挖掘任务取消，不应当作通用 stop。
- 默认动作超时约 30 秒，可由 runtime 配置调整；原生不可合作取消的操作仍须等其实际结束，不能认为超时就可安全重试。客户端物理、窗口缓存与服务端最终结果可能不同步。
- 常见返回 `{ok,output,error,cancelled}`，部分有结构化 `window`、`entities` 等。HTTP command 失败通常为 400，PowerShell 的 Invoke-RestMethod 会抛异常；应保存异常响应体。HTTP 200／`ok:true` 不是物理结果确认，`say /命令` 尤其只表示发送。
- 危险测试只用专用测试世界／区域；先关 Brain，准备回退办法。人工观察不能由同源客户端字段互相比较替代，重要资源变化还要核对游戏世界。

## 3. 状态与环境查询（13 个 query）

源码：`src/commands/queries/<命令>.js`。以下均经 command 入口调用，不是独立 REST 路径。

| 命令／调用 | 参数与当前语义 | 当前状态 | 下一项人工验收 |
| --- | --- | --- | --- |
| `pos` | 无；x/y/z 四舍五入显示 1 位小数，保留维度；完整精度看 `/state.position`；不是方块坐标 | 2026-10-22 负坐标／边界／跨维度已实测；新显示格式自动回归通过 | 原 13 项实测针对旧向下取整格式，记录保留；一位小数显示另行复测，F3 人工对照仍待确认 |
| `hp` | 当前／最大生命值；单位为生命点，2 点为一颗心。文本当前值保留 1 位小数；health/maxHealth 数值字段保留协议精度，未知为 null／? | 2026-10-22 生命提升、伤害、回血开关及最大生命值实测；107/107 自动回归 | 已修分母固定 20 和面板最大血量回退 20；`/state` 新增 maxHealth。对应值按属性及修饰符计算并遵守注册表上下限；吸收黄心已于本日完成添加／受伤耗尽／归零省略实测；死亡／重生等仍待专项验收 |
| `hunger` | 返回 food、saturation、saturationSource；文本饱和度保留 1 位小数，结构值保留协议精度；饱和度明确为 last known，未知为 null／? | 2026-10-22 饥饿／饱和效果、耗尽与恢复实测；114/114 自动回归 | 饥饿值变化与同步后的饱和度对齐服务端；正饱和度单独变化时可滞后，不得当作实时真值；自然进食等仍待测 |
| `oxygen` | 无；自身空气归一化 0..20，未知为 null；原始 tick 看 `/state.airSupplyTicks` | 实测 B：耗氧和恢复；自动局部 | 不需重做基本修复；可补同时间 `/data get entity SteveX-Test Air` 对照，后缀 s 是 NBT 类型非秒 |
| `inventory` | 无；主背包／快捷栏 inventory 数组，非空盔甲与副手单列 equipment；普通／满耐久物品仅 name/count/slot，特殊 NBT／组件才附详情 | 2026-10-22 数量、槽位、物品组件及四件盔甲／副手实测；121/121 自动回归 | inventorySlotSpace 标识背包窗口；equipmentSlotSpace 始终 player-inventory，空装备槽及空 equipment 整体省略；不透视世界容器。真实开窗后换装备仍待扩展 |
| `nearby [type/name/all] [radius]` | 默认 32，整数 1..128；按三维精确距离升序最多 20 个，同距离按实体 ID；物种／类型／用户名／自定义名称不区分大小写子串过滤，ALL 同 all，支持 minecraft:物种 | 2026-10-22 多类型、名称、半径边界、三维距离、玩家过滤和 20 项截断实测；123/123 自动回归 | 仅返回客户端已加载实体，不是视线可见／无穿墙保证，也不保证半径内所有服务端实体均已加载；特殊名称与更多类型仍可扩展 |
| `gamemode` | 无；返回 mode（survival/creative/adventure/spectator），未知为 null／? | 2026-10-22 四种模式逐项对照服务端 playerGameType 通过；自动回归 | 更多跨维度、重生时序仍可补测；查询不修改模式 |
| `xp` | 无；仅返回 level、progressPercent，百分比保留 1 位小数；不返回总经验或原始小数进度，未知为 null／? | 2026-10-22 经验增减、升级、设置及恢复实测；自动回归 | levelProgress 概念仅指当前等级进度；未覆盖真实经验球拾取、附魔／铁砧消耗 |
| `time` | 无；timeOfDay、day、isDay、moonPhase、doDaylightCycle；未知为 null／? | 2026-10-22 时钟 0／6000／12999／13000／23999、跨日及月相周期实测 | isDay 是 Mineflayer 的 <13000 时钟分类，不代表睡眠资格、天气光照或怪物生成判定；跨维度仍待专项验收 |
| `weather` | 无；返回 clear/raining/thunder、rainStrength、thunderStrength；未知为 null／? | 2026-10-22 晴／雨／雷暴稳定状态与服务端天气条件对照通过 | 强度随天气渐变，过渡时标签反映客户端读数，不保证与服务器命令即时一致；生物群系降雪、其他维度未专项验收 |
| `window` | 无；须开窗。返回 type、slotCount、inventoryStart/end、非空 slots、emptySlots 编号；cursor 仅持物时出现。物品沿用背包精简规则，炉子返回 fuelPercent/progressPercent | 2026-10-22 单箱／炉子独立查询、光标及空槽变化、烧炼完成实测；130/130 自动回归 | 明确保留全部空槽位置，不逐个输出 item:null；关闭后报错。双箱、其他工作站精简输出仍需专项验收 |
| `findplayer <name>` | 大小写不敏感子串；精确同名优先；无半径参数，未追踪实体省略位置 | 实测通过 2026-10-22 | 同名片段、远处未追踪、离线与正负坐标已核对；跨维度待测 |
| `findblock <blockName> [radius]` | 精确注册名；默认 32，整数 1..128；已加载区块内方块网格距离 | 实测通过 2026-10-22 | 正负坐标、三维范围边界、空气、无匹配、非法参数已测；128 范围压力待测 |

### 2026-10-22 pos 专项实测（补充第 3 节状态）

`pos` 的方块边界、负坐标和跨维度由待测更新为实测通过；无业务代码修改。原版 Java 1.21.11 本地独立服务端，角色 SteveX-Test，配置名 manual-test；Brain 关闭。共 13 个用例，逐项对照服务端 `/data get entity SteveX-Test Pos`、`Dimension` 与 HTTP `pos` 返回，13/13 通过。维度传送后先等待客户端坐标同步，不代表传送请求瞬间查询也已覆盖。

| 代表输入坐标 | pos 期望与实测坐标 | 维度 |
| --- | --- | --- |
| 10.499, 65.499, 10.499 | 10, 65, 10 | overworld |
| 10.5, 65.5, 10.5 | 10, 65, 10 | overworld |
| 10.999, 65.999, 10.999 | 10, 65, 10 | overworld |
| 11.0, 66.0, 11.0 | 11, 66, 11 | overworld |
| 0.001, -19.001, 0.001 | 0, -20, 0 | overworld |
| -0.001, -19.999, -0.001 | -1, -20, -1 | overworld |
| -0.5, -20.5, -0.5 | -1, -21, -1 | overworld |
| -0.999, -20.999, -0.999 | -1, -21, -1 | overworld |
| -1.0, -21.0, -1.0 | -1, -21, -1 | overworld |
| -1.001, -21.001, -1.001 | -2, -22, -2 | overworld |
| -0.001, 100.5, -1.001 | -1, 100, -2 | the_nether |
| 10.999, 100.5, -0.001 | 10, 100, -1 | the_end |
| 4.5, -60.0, -1.5 | 4, -60, -2 | overworld（返回） |

历史结论（上述 13 项测试时）：使用 `Math.floor` 向下取整；方块 n 覆盖坐标区间 `[n,n+1)`。随后按用户要求，`pos` 已改为四舍五入显示 1 位小数，正负半值均向绝对值增大方向进位，不显示 -0.0，例如 10.95→11.0、-1.25→-1.3、-0.001→0.0。此显示不再代表所属方块；完整精度看 `/state.position`。方块判断及 goto 的 GoalBlock 仍向下取整，未改变。

测试注意：`tp` 的 X/Z 若写整数（如 11），会自动居中到 11.5；精确整数边界须显式写 11.0。本轮采用创造模式加 `startfly` 保持悬空定点；旁观模式并未阻止 Mineflayer 本地重力，不用作定点保障。RCON 辅助脚本已改为等待当前命令回复，不预先发送结束标记。前 3 轮测试条件失败日志保留，不计为业务失败或通过证据。

通过日志：`steveX/runs/api-acceptance-server/pos-1792668502076.json`；复测脚本 `runs/api-acceptance-server/pos-live.cjs`，均为本机忽略的运行资料。完成后已停飞，恢复 survival，并经服务端与 HTTP 双重确认返回 overworld 的 `(4.5,-60,-1.5)`。未移动人工玩家，未提交或推送。

## 4. 朝向、移动与动作控制（11 个 action）

源码：`src/commands/actions/`。先在平坦、无危险实体的区域做；后续寻路另开测试，不沿用基础短步的通过状态。

| 命令／调用 | 参数与当前语义 | 当前状态 | 下一项人工验收 |
| --- | --- | --- | --- |
| `look <yaw> <pitch>` | 有限弧度；pitch -PI/2..PI/2，正数抬头；yaw=0 朝 -Z；例 `look 0 0` | 实测 B；非法参数自动覆盖 | 俯仰边界、完整转圈；不是角度输入 |
| `lookat <x> <y> <z>` | 有限世界坐标；例 `lookat 790.5 64.5 625.5`，需替换为实际位置 | 实测 B；非法参数自动覆盖 | 上下／背后目标、准星是否准确命中方块 |
| `move <control> [durationMs]` | forward/back/left/right/sprint/sneak；默认 1000，整数 1..30000；例 `move forward 150`；结束释放该键 | 实测 B：四方向短步及潜行中断；自动局部 | 障碍、长按、边缘；sprint/sneak 单独不会前进，不是精确走若干格 |
| `jump` | 无；按住 jump 200ms 后释放，返回不代表已落地 | 实测 B：约 1.25 格且落地 | 顶部遮挡、水中、非落地状态待测 |
| `swing [hand]` | 默认 right；left 指另一只手；例 `swing left` | 实测 B＋左右挥手人工确认 | 保留通过；持不同物品时可补测 |
| `stand` | 无；轮到执行时清空控制键，不直接取消动作队列 | 实测 B：stop 后释放检查 | 与持续动作并发时不要当作急停；独立停止语义待验 |
| `stop` | 无；立即请求取消队列动作、清控制、停 Brain | 实测 B：潜行中断；自动局部 | 寻路、挖掘、原生窗口操作中的实际停止待测 |
| `stopdig` | 无；取消活动 dig/mine；调用 stopDigging | 自动局部；真实挖掘待测 | 可挖方块上中途停止；不取消无关移动 |
| `goto <x> <y> <z>` | 有限世界坐标；GoalBlock 向下取整为脚部目标方块；返回 position/target；须 pathfinder ready | 2026-10-22 平地／半砖／直楼梯／水流实测；气泡柱未通过 | 已修非有限参数与空路径假到达；气泡柱规划／稳定驻留仍有缺口，绕障、无路、加载边界等需另测。见地形专项记录 |
| `follow <playerName>` | 精确用户名不区分大小写；跟随距离约 2 格，返回 RUNNING；新 action 可替换 | 自动局部；真实跟随待测 | 玩家移动、掉线／离开加载区、stop 与目标替换 |
| `wait <ticks>` | 正整数；按客户端 physicsTick 等待，例 `wait 20` | 待专项测试 | 停止、掉线、低 TPS；正整数完整解析需复核 |

## 5. 采集、合成与建造（6 个 action）

| 命令／调用 | 参数与当前语义 | 当前状态 | 下一项人工验收 |
| --- | --- | --- | --- |
| `dig` | 无；挖准星 4.5 格内方块，不自动选择最佳工具 | 待测试 | 土／石不同工具、掉落物、不可破坏方块、stopdig |
| `mine <x> <y> <z>` | 读取目标后寻路至 x,y+1,z，再挖旧引用的方块 | 待测试；风险 | 寻路站位、到达前目标改变、掉落拾取并非本命令保证 |
| `collect` | 无；实现取第一个 type=object 且 name=item 的实体，走到约 1 格内 | 待测试；风险 | 新版实体分类、最近目标选择、背包已满；返回移到掉落旁不等于已拾取 |
| `craft <itemName> [count]` | 默认 1；只找手工配方，未传工作台；例 `craft oak_planks 1` | 待测试；风险 | recipesFor 与 craft 的 count 语义可能不同；核对执行次数、实际产物和材料；不要当作已支持工作台合成 |
| `place` | 无；手持方块，对准目标；当前固定在目标顶面放置 | 待测试；限制 | 消耗数量、侧面／底面需求、玩家占位、方块状态；不是任意朝向放置 |
| `placeentity` | 无；手持对应实体物品，对准方块，固定顶面 | 待测试；限制 | 盔甲架与画分别验证，不假定原生 placeEntity 支持所有物品和面 |

## 6. 背包、持物与消耗（7 个 action）

| 命令／调用 | 参数与当前语义 | 当前状态 | 下一项人工验收 |
| --- | --- | --- | --- |
| `equip <item name>` | 名称子串匹配首个背包物品，装到 hand；例 `equip iron_pickaxe` | 待命令专项测试 | 有／无物品、同类组件；当前不能用此命令指定盔甲 destination |
| `hotbar <slot>` | 0..8 的快捷栏索引，不是窗口绝对槽位；例 `hotbar 0` | 待测试 | 切换前后手持物和实际使用对象 |
| `unequip [destination]` | 默认 hand，可 head/torso/legs/feet/off-hand | 待测试 | 装备取下位置、背包满、空装备槽 |
| `use` | 无；激活手持物品，发送成功不是持续使用已完成 | 待命令专项测试 | 食物、弓、地图分别检查；工作站脚本用原生方法不计作本命令实测 |
| `release` | 无；deactivateItem，停止使用／松弓 | 待测试 | 与 use、蓄力状态和动作仲裁配合；新 action 会先停止旧物品动作，不能直接假定跨命令蓄力正确 |
| `drop <itemName> [count]` | 名称子串；不填数量丢首个匹配整组，填数量调用 toss | 待测试；危险 | 指定数量、组件、背包不足；旧数值解析未全面规范化 |
| `toss <itemName> [count]` | 独立实现，行为近似 drop；省略数量丢整组 | 待测试；危险 | 与 drop 同样验收，别因接口近似便标记通过 |

## 7. 箱子、窗口与槽位（8 个 action）

通用槽位操作会改变物品或光标。先 `window` 读布局，单步后核对库存，不要用稀有物品试错。

| 命令／调用 | 参数与当前语义 | 当前状态 | 下一项人工验收 |
| --- | --- | --- | --- |
| `open` | 无；准星 4.5 格内方块，调用 openContainer；虽说明提实体，实际本命令只找方块 | 实测 M：普通箱子；其余待测 | 双箱、末影箱、漏斗、满背包；实体用 openentity |
| `openentity` | 无；准星实体，村民走 openVillager 初始化报价，其余走 openEntity | 实测 W：村民；自动局部 | 矿车／驮箱动物分别测试；不代表已支持所有实体 |
| `dispenser` | 无；准星须为 dispenser/dropper | 自动局部：错误方块拒绝；真实待测 | 两种方块开窗、搬运、关闭 |
| `click <slot> [button]` | 当前窗口槽，button=0 左键／1 右键，默认 0；mode 固定 0 | 待测试 | 半组拆分、堆叠、光标状态、非法槽；不是 shift 快移 |
| `moveslot <sourceSlot> <destSlot>` | 当前窗口或玩家背包槽，来源须非空；例 `moveslot 10 11` 需先核对槽位 | 自动局部：空来源；真实待测 | 完整组、目标非空、组件、开窗编号 |
| `putaway <slot>` | 当前窗口／背包槽，调用 putAway | 自动局部：空来源；真实待测 | 输入／输出取物、背包满与光标；station take 的通过不自动覆盖此入口 |
| `transfer <itemName> [count]` | 默认 1，正安全整数；背包→容器，精确名称优先、兼容子串；光标须空 | 2026-10-22 槽位修复与自动回归通过；游戏内待测 | 按当前窗口 inventoryStart/end 读取与搬运，保留所选物品 NBT；待验单箱／双箱／漏斗、快捷栏末槽、不同组件、满箱和数量不足；不是双向搬运 |
| `close` | 无；关闭 currentWindow | 实测 B/W/M：正常关窗 | 光标持物、合成输入退回、连续关窗与断线 |

## 8. 工作站与交易（5 个主命令，按子操作验收）

表中 `s/s1/s2` 均为当前工作站窗口里的玩家背包槽；`src/dst` 为当前窗口槽；`n` 为数量。

| 主命令／调用 | 参数与语义 | 当前状态 | 下一项人工验收 |
| --- | --- | --- | --- |
| `furnace [operation ...]` | 无参或 open 打开；input/fuel/take 见下表 | 实测 W：普通炉子冶铁；自动局部 | 高炉、烟熏炉、不同燃料、取回输入燃料 |
| `anvil [operation ...]` | 无参或 open 打开；rename/combine 见下表 | 实测 W：改名及合并；自动局部 | 附魔书、冲突／过贵、经验不足、各种损坏铁砧 |
| `enchant [operation ...]` | 无参或 open 打开；put/lapis/choose/take 见下表 | 实测 W：完整附魔链；自动局部 | 高等级、书架、经验／青金石不足、不同装备 |
| `station <operation ...>` | 打开 8 类工作站及通用搬运／选择／状态操作，见下表 | 实测 W：各站代表流程；自动局部 | 每种配方、组件、目标拒绝／超时与取消仍待扩展 |
| `trade <index> [times]` | 交易索引从 0 起，默认 1 次，整数 1..64，须已初始化村民窗口 | 实测 W：0 号报价交易；自动局部 | 双输入、折扣、涨价、缺货、补货及材料不足 |

### 8.1 原生工作站子操作

| 调用 | 参数／前置条件 | 已测与待测 |
| --- | --- | --- |
| `furnace open` | 对准 furnace/blast_furnace/smoker | W 已测 furnace；其余待测 |
| `furnace input <s> [n]` | n 默认 1，1..来源数量 | W 冶铁通过 |
| `furnace fuel <s> [n]` | n 默认 1 | W 煤通过；其他燃料待测 |
| `furnace take <input/fuel/output>` | 指定槽非空 | W output 通过；input/fuel 待真实验收 |
| `anvil open` | 正常／开裂／损坏铁砧 | W 正常铁砧通过 |
| `anvil rename <s> <name...>` | 名称 1..35 字符，经验足够 | W 通过；组件边界待测 |
| `anvil combine <s1> <s2> [name...]` | 两个不同背包槽 | W 损坏工具合并并改名通过；可选名称长度未同 rename 一致校验，待审计 |
| `enchant open` | 对准附魔台 | W 通过 |
| `enchant put <s>` | 放入可附魔物品，目标槽须空 | W 通过 |
| `enchant lapis <s>` | 来源为 lapis_lazuli，槽须空 | W 通过 |
| `enchant choose <0..2>` | 先查询 window.enchantments，选项可用 | W 0 号通过；其他选项待真实验收 |
| `enchant take` | 取回目标槽物品 | W 通过；青金石取回可单独测槽位操作 |

### 8.2 通用工作站子操作与槽位

| 调用 | 参数／前置条件 | 已测与待测 |
| --- | --- | --- |
| `station open brewing` | 酿造台：瓶 0..2、原料 3、燃料 4 | W 水瓶→粗制药水通过；其他药水待测 |
| `station open loom` | 织布机：旗帜 0、染料 1、图案 2、结果 3 | W 染旗通过；完整图案枚举待实现 |
| `station open stonecutter` | 切石机：输入 0、结果 1 | W 通过；完整配方索引待实现 |
| `station open smithing` | 锻造台：模板 0、装备 1、材料 2、结果 3 | W 下界合金镐升级通过；盔甲纹饰待测 |
| `station open grindstone` | 砂轮：输入 0..1、结果 2 | W 去附魔通过；合并修复待测 |
| `station open cartography` | 制图台：地图 0、辅助物 1、结果 2 | W 地图＋纸扩展通过；复制／锁定待测 |
| `station open beacon` | 信标：支付物 0；需有效底座 | W 一层速度通过；高层组合待测 |
| `station open crafter` | 合成器：九宫格 0..8 | W 开关通过；红石生产链待测 |
| `station move <src> <dst> [n]` | 默认来源整组；按实际窗口范围，来源与目标须不同 | W 多站输入通过；NBT/组件与拒绝槽位仍需扩展 |
| `station take <slot>` | 只能是工作站槽，小于 inventoryStart | W 多站取出通过；满背包待测 |
| `station select <index>` | 仅 loom/stonecutter，整数 0..127；需服务端选中属性及结果物品 | W loom=1、stonecutter=0；其他索引待测，不保证范围内全有配方 |
| `station crafter <0..8> <enabled/disabled>` | 槽和光标都须空 | W 槽 0 两种状态通过；其他槽位待扩展 |
| `station beacon <primary> [secondary/none]` | 主效果 speed/haste/resistance/jump_boost/strength；副效果 none、regeneration 或同主效果；高层及支付校验 | W speed、无副效果通过；四层再生／强化效果待测 |

信标／织布／切石／合成器协议适配只声明支持 1.21.11。完整返回、超时语义和组件边界见 [工作站文档](mineflayer-workstations.md)。

## 9. 生存、休息与钓鱼（5 个 action）

| 命令／调用 | 参数与语义 | 当前状态 | 下一项人工验收 |
| --- | --- | --- | --- |
| `eat` | 无；须有手持物，调用 consume；未严格校验食物类型 | 自动局部；真实待测 | 饥饿时吃面包、满饥饿、非食物、数量和饱和度 |
| `sleep` | 无；找 4 格内床，调用 sleep | 待测试 | 床距离、白天拒绝、怪物干扰、多人睡觉 |
| `wake` | 无；须处于睡眠 | 待测试 | 起床位置、未睡眠时拒绝 |
| `respawn` | 无；调用 respawn；死亡状态和自动重生行为需确认 | 待测试；高风险 | 死亡／重生时 agent online 门控、Brain 与队列重建，别在日常存档试 |
| `fish` | 无；须手持 fishing_rod，等待原生 fish 完成 | 自动局部：未持竿拒绝；真实待测 | 水面、上钩、收杆、超时／停止，默认动作超时可能影响等待 |

## 10. 实体交互与战斗（4 个 action）

| 命令／调用 | 参数与语义 | 当前状态 | 下一项人工验收 |
| --- | --- | --- | --- |
| `attack` | 无；实际调用 nearestEntity，没有敌我／类型过滤 | 自动局部；真实待测；危险 | 只在隔离目标区域测，可能打到房主／宠物；范围与命中确认 |
| `interact` | 无；先准星实体，再准星方块，4.5 格 | 待测试 | 门、按钮、实体分开测；服务端效果与交互距离 |
| `interactat <entityName>` | 类型名子串匹配第一个已加载实体，位置用 entity.position | 待测试；限制 | 盔甲架、碰撞点局部／绝对坐标语义；不保证最近目标 |
| `useon <entityName>` | 匹配第一个实体，对其 useOn；例 `useon sheep` | 待测试；限制 | 剪羊毛／上鞍等逐场景测试；实际距离及手持物校验 |

## 11. 载具与鞘翅（4 个 action）

| 命令／调用 | 参数与语义 | 当前状态 | 下一项人工验收 |
| --- | --- | --- | --- |
| `mount` | 无；当前挑第一个 type=mob/object 的实体，未校验可骑乘／最近 | 待测试；风险 | 先修核目标筛选，再测船／矿车，避免把“存在 mob”当作可骑乘 |
| `dismount` | 无；须已有 vehicle | 待测试 | 船／矿车下车与安全落点 |
| `drive <left/right> <forward/back>` | 两参数都必填；内部映射为正负 1，持续输入未在命令内限时 | 待测试；风险 | 非法值默认映射、方向、如何归零；`stop` 是否停止载具须另验，勿类推玩家控制 |
| `elytra` | 无；须满足原生鞘翅起飞条件 | 待测试；高风险 | 装备、起飞状态、落地／取消，只在安全测试场 |

## 12. 聊天与书本（3 个 action）

| 命令／调用 | 参数与语义 | 当前状态 | 下一项人工验收 |
| --- | --- | --- | --- |
| `say <message...>` | 后续参数按空格拼接；可发送以 / 开头的游戏命令，但仍受服务端权限限制 | 实测 B：聊天预告 | Unicode、长度、限速；发送成功不代表 /data、/op 执行成功 |
| `whisper <player> <message...>` | 玩家名一个参数，其余为文本 | 待测试 | 接收方回执、未知玩家、服务端私聊规则 |
| `writebook <slot> <pages...>` | 玩家背包槽，页文本以竖线分隔，可含空格；需对应可写书 | 待测试；有副作用 | 多页、中文、组件、旧槽位与现代写书协议；不是签名功能承诺 |

## 13. 会话、资源包与管理（5 个 action）

| 命令／调用 | 参数与语义 | 当前状态 | 下一项人工验收 |
| --- | --- | --- | --- |
| `quit [reason...]` | 默认 disconnect.quitting；结束当前连接 | 待命令专项测试 | 与 HTTP disconnect 区分；状态、重新连接和未完成动作清理 |
| `settings <key> <value...>` | true/false 转布尔，数字转 Number，否则字符串；如 `settings viewDistance 8` | 待测试；风险 | 目前没有完整 key 白名单；只改变测试 bot 设置，服务器效果需确认 |
| `acceptpack` | 无；须有服务端资源包请求 | 待测试；有下载副作用 | 可信资源包、状态回执、失败／缓存；禁止用不可信地址试验 |
| `denypack` | 无；拒绝资源包 | 待测试 | 可选／强制包，强制拒绝可能踢出 |
| `setcommandblock <x> <y> <z> <command...>` | 实际修改已有命令方块的内容，不是自动放置方块；需服务端允许及相应权限／模式 | 待测试；高风险 | 源码调用原生 setCommandBlock 参数形态亦待核查；不等同于 /op，不用于常规验收起步 |

## 14. 创造模式工具（6 个 creative）

必须先人工确认 agent 的游戏模式和测试权限；名为 creative 不等于 handler 已替你检查所有前置条件。

| 命令／调用 | 参数与语义 | 当前状态 | 下一项人工验收 |
| --- | --- | --- | --- |
| `startfly` | 无；开启原生 creative 飞行／零重力 | 待测试 | 模式权限、是否能停、浮空状态 |
| `stopfly` | 无；恢复重力 | 待测试；落下风险 | 先保证脚下安全，核对落地 |
| `flyto <x> <y> <z>` | 世界坐标，直线飞行；不承诺绕障 | 待测试 | 安全短距离、障碍、取消、数值校验 |
| `setinventory <slot> [itemName] [count] [metadata]` | 玩家背包槽；无 itemName 则清槽，count 默认 1，metadata 默认 0 | 待测试；改物品 | 新物品组件支持范围、数量、非法槽、服务器拒绝 |
| `clearslot <slot>` | 清除一个玩家背包槽 | 待测试；删除物品 | 只用可丢弃测试材料，核对指定槽 |
| `clearinventory` | 无；清空整个玩家背包 | 待测试；删除物品 | 专用空角色，检查装备／副手与残留，不在日常角色运行 |

## 15. HTTP 与 WebSocket

源码：[routes.js](../src/web/server/routes.js)、[ws.js](../src/web/server/ws.js)。下面路径中的 name 是配置名，须 URL 编码。管理接口不等同于玩家命令，未连接时部分接口仍可查询落盘记录。本地开发接口没有完整认证，不对公网开放；配置接口可能返回密钥，不要公开响应。

| 方法与路径 | 请求／返回要点 | 当前证据与人工待验 |
| --- | --- | --- |
| `GET /api/status` | 无 body；agents 状态及 uptimeSec，不保证含 ok 字段 | B 真实轮询；断线／多玩家刷新待验 |
| `GET /api/commands` | 无；77 个命令的 name/kind/description/usage | H 自动覆盖；B 使用过目录，参数 schema 完整性不保证 |
| `GET /api/skills` | 无；局部 skillRegistry 的 args 与说明，不是所有命令 | 待路由专项验收；禁止拿它代替完整命令清单 |
| `GET /api/config/environment` | 无；读取当前环境配置文件；不存在可能报错，非完整合并后配置 | 待专项验收；可能包含密钥，只本地查看 |
| `POST /api/config/environment` | `{"config":{...}}`，最大约 512KiB；写文件，不自动 reload | 待专项验收；备份配置，别覆盖 API key |
| `POST /api/reload` | 无必填 body；重载配置，会断开旧 agent／渲染服务；不承诺自动连回全部 agent | M 真实 reload 后重新 connect 通过；H 自动局部；更换真实配置与失败恢复待扩展 |
| `POST /api/agents/:name/connect` | 无必填 body；按配置启动连接，返回 ok 不等于已 spawn | M 真实 reload 后重连通过；H 生命周期自动覆盖，未知角色与重复连接待专项验收 |
| `POST /api/agents/:name/disconnect` | 无必填 body；断开指定 agent | B 真实执行；运行中停止／写盘排空边界待扩展 |
| `POST /api/agents/:name/command` | `{"command":"pos"}`；成功 200，失败通常 400 | B/M 真实 HTTP 链路＋自动局部；W 主要经 executeCommand 测命令本体，不冒充所有 HTTP 入口复测 |
| `GET /api/agents/:name/state` | 无；精确位置、生命／食物／氧气、朝向、7 键、局部碰撞、背包与槽位空间 | B 实测，H 自动隔离；局部数据仍是客户端缓存 |
| `GET /api/agents/:name/memory/containers` | 无；actor/session 隔离的历史开窗记录、source、observedAt | M 真实开箱和存盘，H 自动；离线旧记录不等于实时状态，旧 NBT 无损转换待实现 |
| `POST /api/agents/:name/brain/start` | 无必填 body；使用 agent.config.brain；需在线、有效 LLM 配置 | M 无 Key 返回 400 已实测；Brain 逻辑自动局部；有效 Key／真实 LLM 任务待验 |
| `POST /api/agents/:name/brain/stop` | 无必填 body；停止 Brain 调度；不同于 command=stop 的全部动作取消 | 自动局部；真实手动动作／Brain 后台动作归属待验 |
| `GET /api/renderer/status` | 无；关闭时返回 enabled=false，开启时查询共享服务 | M 历史集成验收，渲染服务自动局部；本轮基础测试未启动渲染端 |
| `POST /api/agents/:name/observe` | 无必填 body；指定身体视角采集，进入共享渲染队列 | M HTTP 采集、alpha→beta→alpha 及并发隔离实测；H 关闭退化／帧校验自动覆盖；长期连续切换／跨维度待扩展 |
| `POST /api/agents/:name/nbt/query` | `{path,fields,filters?,limit?}`；path 为 entities/containers/block_entities/biomes/terrain | H 夹具、隔离与错误回归；M NBT 迁移；真实各源查询待逐项验；来自捕获落盘数据，不是服务端透视 |

15 个路由模板中 `brain/:operation` 展开为 start/stop，故上表为 16 行。静态页面不计入 API。WebSocket 与面板共用端口，连接 `ws://127.0.0.1:8090/`；主要推送 snapshot、agent:connect/disconnect/update、agent:command:start/done 等，**不是另一个执行命令入口**。目前只记作面板联通／实现可见，断线重连、字段完整性与多客户端专项待测。

NBT 查询示例（需配置对应 agent 的 renderer/memoryNamespace 和已有捕获数据）：

参数仅接受 path、fields、filters、limit：path 必填、fields 是必填非空字符串数组；filters 默认空对象，键为字段路径，值可为标量、数值闭区间 `{min,max}` 或受支持的同类并集；limit 默认 64，整数 1..512。HTTP 不接受额外 taskId／任意文件路径。返回含 result、matchedCount、sourceVersion 和 agent 身份字段。完整语法见 [NBT 设计资料](nbt查询api设计方案.md)，以 [query.js](../src/nbt/query.js) 当前校验为准，不推断未实现的数组量词。

```powershell
$query = @{ path='terrain'; fields=@('pos','block'); filters=@{block='minecraft:stone'}; limit=8 }
Invoke-RestMethod "$base/api/agents/$agent/nbt/query" -Method Post `
  -ContentType 'application/json' -Body ($query | ConvertTo-Json -Depth 6)
```

共享 Fabric WS 只允许 status、render/bind、render/status、render/capture、render/unbind。它们由共享服务负责调用，不要手动绕过队列切换相机或操作旧 container/player/key 方法。旧 `src/mod/methods.js`、`pressable_methods.js` 是原生开发路线目录，不代表主线新增 REST 执行接口。`mc:renderer`／`mc:memory` 为启动脚本，不是玩家命令，见运行与 NBT 文档。

### 2026-10-22 地形专项更新

完整场地坐标、实测结果、原始日志与复测命令见 [地形移动与寻路实机验收](<terrain-live-validation.md>)。已搭建平地、底半砖、直楼梯、顺逆水流、上升／下降气泡柱，并分别测试 move、jump、goto；不等于所有地形变体或人工对照均通过。

- 平地、底半砖、直楼梯与校准水流的对应移动现象和寻路成功路径已记录；人工账号坐标同步采集，但人工操作的配对基线仍待签字。
- 气泡柱上升／下拉现象可见，goto 柱内定位仍不可靠，列为未通过／能力缺口。
- 已修 goto 非有限坐标校验，以及上游空路径提前 resolve 被误报 Arrived；现在成功前核对实际脚部方块，不满足即返回错误及 position/target。99/99 自动回归通过。
- 实机脚本为 `scripts/terrain-live-smoke.cjs`，必须显式 --live；含独占锁、指定跑道／动作过滤和 12 秒 stop 看门狗。曾发生 Node 测试发现实机脚本导致并发控制，相关记录已作废；重命名和测试上下文保护后重新单进程验收。
- 保留场地、服务端和测试玩家供人工观察；未提交、推送或合并。后续 P1 寻路项只完成了上述子集，不整项勾选。

### 2026-10-22 旁观模式修复更新

之前 pos 定点测试发现的旁观模式下落问题已完成局部兼容修复，不再只是未修异常。Minecraft 相关依赖与 npm latest 一致，本轮不改锁文件、不使用未发布 master。新增 spectator_compat，仅针对 Minecraft 1.21.11 / prismarine-physics 1.11.1；其他游戏模式委托原实现。

实机完成悬空、穿玻璃／水体、左右移动、jump/sneak 升降、切回生存恢复重力；服务端坐标对照通过，角色已返回半砖起点。日志 `runs/api-acceptance-server/spectator-1792670127103.json`，自动回归 104/104。未声称完整原版物理一致，也未实现滚轮调速／附身。升级物理库时必须复验并优先移除上游已覆盖的兼容层。详见 [旁观模式兼容修复](<spectator-compatibility.md>)。

### 2026-10-22 生命值专项更新

本轮在独立原版 1.21.11 服务端，对 SteveX-Test 测试；未修改人工账号的血量／属性。临时执行 `gamerule minecraft:natural_health_regeneration false`，服务端 `/data get entity SteveX-Test Health` 与 `/attribute SteveX-Test minecraft:max_health get` 为独立读数，对照 `hp`、`GET /api/agents/manual-test/state`、`GET /api/status` 中该角色的 health/maxHealth。

发现并修复：hp 分母写死 20；面板后端依赖不存在的 bot.maxHealth 并默认 20；state 未提供 maxHealth。新增统一 health_state，读取当前玩家最大生命属性及加值／基数倍率／总倍率修饰符，最后应用版本注册表上下限。没有把当前血量钳制为最大血量，以免掩盖真实协议读数。

| 操作／场景 | 服务端与三个入口的实测当前／最大生命值 |
| --- | --- |
| 初始状态 | 20/20 |
| `damage SteveX-Test 6.5 minecraft:generic` | 13.5/20 |
| 关闭自然回血后再等 3 秒 | 仍为 13.5/20 |
| `attribute SteveX-Test minecraft:max_health base set 40` | 13.5/40，增加上限不自动治疗 |
| instant_health 治疗 | 40/40 |
| 再伤害 12.75 点 | 27.25/40 |
| `effect give SteveX-Test minecraft:health_boost 300 1 true`（生命提升 II） | 27.25/48，修饰符增加 8 点上限 |
| 有提升效果时治疗 | 48/48 |
| 移除 health_boost | 40/40 |
| 降低基础上限至 12，及再次治疗 | 12/12 |
| 基础上限 7.5，治疗后伤害 0.5 点 | 先 7.5/7.5，再 7/7.5 |
| 基础值设为 5000 | 有效上限按注册表限制为 1024，读数 7/1024 |
| 基础值设为 0，再治疗 | 有效下限为 1，读数 1/1；未执行致死测试 |
| 恢复 | 20/20，无 health_boost，自然回血恢复 true |

最终实机共 16 个检查点（含恢复）通过，原始日志 `steveX/runs/api-acceptance-server/health-1792670450723.json`，脚本 `runs/api-acceptance-server/health-live.cjs`，均为本机忽略的运行资料。首次脚本遇到 bot 尚未重连而提前退出，未修改规则；补在线等待后重跑。最终自动回归为 107/107。

原版 `/data modify entity` 不能直接改玩家 Health，本轮用治疗／damage 控制当前血量，再读取真实 Health 核验；没有声称直接 NBT 写入成功。27.25 点的文本 hp 会按既有 1 位小数格式显示 27.3，但结构化字段及服务端均为 27.25；精确计算应使用数值字段，不解析展示文本。未运行真实 LLM，未把本轮通过扩展到吸收黄心、抗性／护甲减伤或死亡重生。

### 2026-10-22 吸收黄心按需返回

`hp` 及 `/state` 通过统一生命值读取器，从玩家元数据的 `player_absorption` 读取剩余吸收生命点（2 点为一颗黄心），不以药水等级或 max_absorption 代替，不加进 health/maxHealth。

仅当值为有限数字且大于 0 时，增加 `absorption` 字段，hp 文本追加 ` | Absorption: 5.5` 等实际数值。为 0、缺失、未知或非法值时，字段完全省略，文本保持原来的 `HP: 当前/最大`，不返回 absorption:0 或 null。元数据缺少字段定义时也不猜固定索引。很小的正值保留数值，避免显示为 0.0。

新增自动回归覆盖正值、小正值、从正值变成零、零／未知／非有限／非数值的省略，以及 HTTP state 的字段出现与消失。自动回归 111/111 通过。随后已重启 SteveX 服务加载修改，并完成下述吸收药水／受伤实测，不再列作未实测项。

#### 吸收药水实机验收

原版 1.21.11 本地独立服务端，测试角色 SteveX-Test，Brain 关闭；只重启 SteveX Node 服务，未重启 Minecraft 服务端或操作人工账号。暂时关闭自然回血，每次伤害间隔至少 750ms，以服务端 `data get entity SteveX-Test AbsorptionAmount` 和 `Health` 对照 hp 及 `/state`；不根据药水效果是否存在推断剩余黄心。

| 操作 | 服务端吸收／普通生命值 | hp 文本 | hp 与 state 的 absorption 字段 |
| --- | --- | --- | --- |
| 初始无效果 | 0 / 20 | HP: 20.0/20 | 完全省略 |
| `effect give SteveX-Test minecraft:absorption 300 1 true`（吸收 II） | 8 / 20 | HP: 20.0/20 \| Absorption: 8 | 数值 8 |
| `damage SteveX-Test 3 minecraft:generic` | 5 / 20 | HP: 20.0/20 \| Absorption: 5 | 数值 5 |
| 再伤害 5 点，药水效果仍存在 | 0 / 20 | HP: 20.0/20 | 完全省略，不是 0 或 null |
| 再伤害 1 点 | 0 / 19 | HP: 19.0/20 | 完全省略 |
| 清除吸收效果 | 0 / 19 | HP: 19.0/20 | 完全省略 |
| 治疗并恢复原规则 | 0 / 20 | HP: 20.0/20 | 完全省略 |

7/7 检查点通过；每次最大生命值均为 20，吸收值未加进普通生命值或最大值。结束时无吸收效果、Health=20、AbsorptionAmount=0，自然回血恢复 true，最新 SteveX 服务继续运行。日志 `steveX/runs/api-acceptance-server/absorption-1792670875334.json`，复测脚本 `runs/api-acceptance-server/absorption-live.cjs`，均为忽略的本机运行资料。未覆盖吸收药水自然到期、伤害单次穿透全部黄心、护甲／抗性组合等其他边界。未提交或推送。

### 2026-10-22 饥饿值与饱和度专项

原版 1.21.11，SteveX-Test，Brain 关闭；重启 SteveX 加载新查询。以服务端 `data get entity SteveX-Test foodLevel`、`foodSaturationLevel` 为对照，另记录 foodExhaustionLevel 诊断消耗过程。只给测试玩家施加 hunger／saturation 效果；为了观察掉饥饿值，临时将和平改为简单难度、关闭 spawn_mobs 和 natural_health_regeneration，结束后均恢复。

| 场景 | 服务端 food / saturation | 查询 food / saturation | 判定 |
| --- | --- | --- | --- |
| 初始满值 | 20 / 20 | 20 / 20 | 一致 |
| hunger 效果只消耗部分正饱和度 | 20 / 18 | 20 / 20 | 复现客户端缓存滞后，不记实时一致通过 |
| 测试专用 damage 1 点触发生命值更新 | 20 / 18 | 20 / 18 | 刷新后对齐 |
| 较强 hunger 耗尽饱和度后降低饥饿值 | 0 / 0 | 0 / 0 | 一致 |
| 短暂 saturation 效果部分恢复 | 1 / 1 | 1 / 1 | 一致；不把该值当成固定剂量结果 |
| saturation 补满 | 20 / 20 | 20 / 20 | 一致 |
| 恢复角色及规则后 | 20 / 20 | 20 / 20 | 一致，Health=20 |

发现与处理：原 hunger 只有文字，state 仅有 food。新增统一 food_state，给 hunger 和 `/state` 增加饱和度数值及来源；未知／非有限值返回 null、展示 ?，不硬填满值。正饱和度单独变化时，本轮服务端没有及时下发新读数，Mineflayer foodSaturation 仍是旧值；因此增加 `saturationSource: last-update-health-packet`，文本增加 `(last known)`。这修正了观测语义，不代表客户端已能获取实时精确饱和度。`/state.observedAt` 是查询时间，不是该饱和度对应的服务端采样时间。

正式 hunger/state 查询不发送伤害、治疗、管理命令来强制刷新，不使用 RCON 给 agent 补齐隐藏数据，也不根据药水等级或 food 猜测饱和度。测试中的 1 点伤害仅用于确认协议刷新条件。饱和度文本示例：`Hunger: 20/20 | Saturation: 20.0 (last known)`。

最终记录含 6 个服务端与客户端一致检查点及 1 个明确的缓存滞后案例；自动回归 114/114 通过，覆盖数值精度、零值／未知值、来源标识和 HTTP state 字段。前两轮分别因饥饿施加时间不足未达到预设状态而提前终止，日志保留；每轮 finally 均恢复规则，不误记为数值读取通过。

最终日志 `steveX/runs/api-acceptance-server/food-1792671233471.json`；早期记录 `food-1792671149184.json`、`food-1792671218999.json`；脚本 `runs/api-acceptance-server/food-live.cjs`，均为本机忽略的运行资料。已恢复和平、刷怪 true、自然回血 true，测试玩家 food=20、saturation=20、Health=20，无 hunger/saturation 效果；未声称精确恢复原始 exhaustion。未提交或推送。

### 2026-10-22 背包与物品特殊数据专项

已重启 SteveX 服务，向初始空背包的 SteveX-Test 定槽发放物品，逐项读取服务端 Inventory 的 id/count/组件，再对照 `inventory` 与 `/state.inventory`；未改人工账号物品。

| 实测项 | 服务端设置及核对结果 |
| --- | --- |
| 普通堆叠与重复物品 | stone 64 与 3 分为不同槽；oak_log 5 与 17 分别在快捷栏、主背包；数量和槽位对应 |
| 满耐久工具 | stone_shovel，damage=0；精简结果仅 name/count/slot，无耐久字段或 Damage:0 伪 NBT |
| 损耗及附魔 | diamond_pickaxe，damage=123、efficiency IV、unbreaking III；组件值及附魔 ID 对照注册表一致 |
| 成书 | written_book，标题 API Test、作者 SteveX、两页文字；标题／作者／页数／正文保留 |
| 书与笔 | writable_book，两页草稿；内容保留 |
| 收纳袋物品 | bundle_contents：diamond 3、apple 5；嵌套名称和数量一致 |
| 潜影盒物品 | blue_shulker_box 的 container：第 0 槽 iron_ingot 12、第 26 槽 emerald 2；内容及末槽位置保留 |
| 自定义数据／移除默认组件 | custom_data 中 long 42 和标签保留，移除 attribute_modifiers 的记录未丢失 |
| 初版查询范围（历史） | 当时另发放头盔与副手盾牌，未混入主背包／快捷栏结果；注意 1.21.11 服务端装备保存在 equipment，而非 Inventory。后续已新增独立 equipment 返回，见下节 |
| 空背包及恢复 | 本轮 11 个主背包／快捷栏堆栈逐槽核验；测试后清除本轮物品，服务端 Inventory=[]，命令返回 inventory:[] |

修复原 inventory 仅返回名称／数量文字、没有结构化详情的问题。新增精简 compactItemView 用于 inventory 和 `/state` 背包，保留有意义数据，但不重复返回可由名称查到的 type、默认 metadata=0、空 components/removedComponents、nbt:null、空 NBT。现代 damage=0 与合成的旧 Damage:0 均省略；只要存在非零损耗、附魔、书本、容器内容、自定义 NBT 或移除默认组件等信息，就保留对应字段。不会因 nbt=null 而误删现代 components，也不修改原 Item 对象。窗口与落盘记忆的完整 itemView 不在此精简范围。

1.21.11 主要使用数据组件而不是旧 tag NBT。返回 `components` 是协议解码形式，嵌套物品可能是 itemId/itemCount，附魔也可能是注册表 ID；对照名称需使用对应版本注册表，不能把数字 ID 当作跨版本固定值。此处读取的是背包物品携带且服务端已同步的容器内容，不是读取世界中未打开箱子／潜影盒的隐藏库存；没有实现任意服务端 NBT 透视。这里只验证表列组件，不能保证任意未来或自定义组件都已覆盖。

服务端 Inventory 的 Slot 与 Mineflayer 玩家窗口槽位不同：快捷栏 NBT 0..8 对应窗口 36..44，主背包首槽 NBT 9 对应窗口 9；返回 slot 属于 inventorySlotSpace 指定的窗口编号。开容器时使用当前窗口的背包区域，不能沿用玩家窗口槽号。

原始完整数据验收日志 `steveX/runs/api-acceptance-server/inventory-1792671694207.json`；精简版最终实测 `inventory-1792671776756.json`；脚本 `runs/api-acceptance-server/inventory-live.cjs`，均为忽略的本机运行资料。自动回归 119/119 通过，包括空背包、重复堆叠、槽位、嵌套数据、BigInt 序列化、满耐久省略及不修改原始数据。用户要求的饱和度仍是 last known，未新增服务端同步。未提交或推送。

### 2026-10-22 装备与副手补充

`inventory` 和 `/state` 现在增加可选的 `equipment` 对象，包含非空的 head、torso、legs、feet、offhand。每件沿用精简物品格式；空槽不返回，所有槽都空时 equipment 及 equipmentSlotSpace 均省略。当前主手仍对应快捷栏，不重复添加一份装备数据。

装备槽号通过 Mineflayer getEquipmentDestSlot 查询，从玩家背包窗口读取，明确 `equipmentSlotSpace: player-inventory`；不从当前箱子相同编号的槽位取装备。本版玩家窗口为 head=5、torso=6、legs=7、feet=8、offhand=45。开窗时 inventory 的槽位空间可变，但 equipment 的槽位空间不变。

已重启服务并对照服务端 `data get entity SteveX-Test equipment` 实测：铁头盔、铁胸甲、铁护腿、铁靴、盾牌均正确返回；胸甲 damage=25 保留，满耐久头盔和盾牌只返回 name/count/slot；inventory 与 `/state` 的装备结果一致。清理后装备字段完全消失，测试玩家背包和装备均为空。

新增自动测试覆盖装备／副手独立返回、空槽省略、满耐久精简、受损装备保留和开箱槽号冲突，121/121 通过。最终实机日志 `steveX/runs/api-acceptance-server/inventory-1792671926844.json`，沿用 inventory-live.cjs。开箱后真实换装、离线重连装备同步等边界尚未专项实测。未提交或推送。

### 2026-10-22 nearby 专项

测试玩家临时传送至独立平地区域 `(220.5,-60,100.5)`，召唤 8 个固定位置实体：牛、猪、羊、盔甲架、掉落物、船；另以临时 Mineflayer 玩家 NBQ-Peer 验证真实玩家过滤，未传送或控制人工账号。召唤对象带本轮独立标签，使用 NoAI／NoGravity／Invulnerable 等保持坐标稳定。

| 查询／场景 | 实测结果 |
| --- | --- |
| `nearby nBqAlPhA 32` | 大小写混合子串命中 NBQAlpha、NBQAlphaFar，距离分别 2、16 |
| `nearby minecraft:COW 32` | 按物种命中同两头牛，返回原物种 entityName=cow，未因自定义名字丢掉物种过滤 |
| `nearby NBQ 4` | 含 2 格牛、正上方 3 格盔甲架、恰好 4 格猪；排除 4.001 格羊 |
| `nearby NBQ 5` | 再含 4.001 格羊、水平偏移 (3,4) 距离 5 的盔甲架和 5 格掉落物，所有距离与服务端 Pos 一致 |
| `nearby NBQ 1` | 空列表 |
| `nearby ALL 32` | 不把 ALL 当名字过滤，包含全部 8 个已加载测试实体，并按距离升序 |
| 非法半径 0、129、1.5、8abc | 均拒绝，不执行任意范围扫描 |
| `nearby nbq-peer 8`／`nearby player 8` | 均命中临时真实玩家 NBQ-Peer，距离 1；排除自身 |
| 22 个 NBQLimit 盔甲架，`nearby NBQLimit 16` | 返回最近 20 个，顺序与逐实体服务端坐标计算的三维距离一致，非先截断后排序 |

距离判定采用实体脚部位置之间的欧氏距离，包含精确半径边界（<=），不按展示文字舍入后再判定范围。结构化 entities.distance/position 保留精度；原文字距离与坐标仍向下取整，不应解析展示文本作精确距离判断。pos 命令的一位小数显示变更不改变这里的筛选计算。

发现并修复：ALL 大写未识别；CustomName 未参与查询。现在按版本 metadataKeys 定位 custom_name，使用 prismarine-chat 解码现代 NBT 文本组件，自定义名参与过滤和展示；用户名优先，仍可通过 entityName 查物种。另补同距离 ID 确定性排序和同 ID 自身排除，不只依赖对象引用。元数据无法解析时保留普通物种／类型查询，不使整个请求崩溃。

本轮覆盖牛／猪／羊 animal、盔甲架 living、物品／船 other、玩家 player 等不同实体来源；没有验证所有种类、维度和实体追踪距离。123/123 自动回归通过，含恰好边界／边界外、垂直距离、大小写／物种前缀／自定义名、同距离排序、最多 20 项和非法半径。

最终实测日志 `steveX/runs/api-acceptance-server/nearby-1792672228212.json`，脚本 `runs/api-acceptance-server/nearby-live.cjs`。首轮记录 `nearby-1792672136941.json` 同样通过，但 kill 生物会产生掉落物，已按已核实的测试种类／位置清理；最终脚本先将标记实体移到世界下方再 kill，避免测试场残留战利品。临时玩家已断线，所有标记实体清除，SteveX-Test 返回 `(100.5,-60,8.5)`。服务端／主 SteveX 服务继续运行，未提交或推送。

### 2026-10-22 模式／经验／时间／天气专项

原版 1.21.11，测试角色 SteveX-Test。服务端 RCON 仅作验收和恢复，不接入 agent 日常查询。最终 23 个检查点通过，自动回归 127/127；已重启服务加载结果。

| 查询 | 服务端对照与覆盖 |
| --- | --- |
| gamemode（4 项） | survival、creative、adventure、spectator，分别读取 playerGameType=0/1/2/3；命令和 state 一致 |
| xp（7 项） | 零经验；加 5 点；再加 10 点跨级；设 20 级、等级内 12 点；再加 2 级；设 30 级和等级内 17 点；减 5 级。以 XpLevel、XpP 核对等级及百分比 |
| time（9 项） | 暂停 advance_time 后设 0、6000、12999、13000、23999、24000、114000、186000、192000；读取 time query day/daytime；验证昼夜边界、跨日、月相 day%8 的 0/1/4/7/0 循环及冻结标志 |
| weather（3 项） | clear、rain、thunder；用服务端内联 minecraft:weather_check 条件检查 raining/thundering，等待客户端强度稳定；晴 0/0、雨 1/0、雷暴 1/1 一致 |

按用户要求，xp 最终只返回 `level` 和 `progressPercent`，例如 `Level: 20 \| Progress: 19.4%`；不增加 totalExperience、原始 progress 或当前等级点数字段。服务端 XpTotal 与 experience query points 仅用于日志诊断及恢复原值，不作为 Agent 观测。命令设置等级／点数时 XpTotal 可以与按等级推算的累计点数不同；没有用等级公式虚构总经验。

修复 xp 未知进度显示 NaN%／缺失对象报错，以及 time 未知 isDay 被误写为 night；gamemode 增加明确 mode 字段及未知处理；weather 补雷暴识别和强度。天气淡入淡出会经过中间强度，不能在命令发出瞬间就要求服务端天气条件和客户端都达到稳定端点。初轮正是因过早比较而退出，恢复逻辑执行，随后补等待后重测通过。

最终日志 `steveX/runs/api-acceptance-server/world-queries-1792672741345.json`，脚本 `runs/api-acceptance-server/world-queries-live.cjs`。较早记录 `world-queries-1792672494075.json` 为过渡条件提前判定；`world-queries-1792672538149.json` 已完成 23 项，但仍包含后来已按用户要求移除的 XP 返回字段，且天气恢复检查未等待渐变，应以最终记录为准。

已恢复 survival、等级 0、进度 0%、总经验 0，时间恢复冻结前取样值后继续推进，advance_time/advance_weather 均恢复 true，天气恢复晴且强度归零。天气恢复重新采用默认持续时间，不声称还原原始天气倒计时；实测阶段显式使用 300s，避免裸数字持续时间单位歧义。未操作人工账号的模式／经验。未提交或推送。

### 2026-10-22 移除辅助查询

按用户要求删除 digtime（精确挖掘时间估算）和 equipslot（内部装备槽号查询），不再出现在命令目录及分发表中。当前 77 个命令，含 13 个 query；保留 Mineflayer 内部的 digTime/getEquipmentDestSlot，供正常挖掘及装备实现使用，不作为独立 Agent 查询入口。新增移除入口回归测试，历史 79 命令统计仅作初版记录。

### 2026-10-22 window 精简与箱子／炉子实测

按用户要求保留 window。空槽也是可见且可用于操作的信息，因此保留其**槽位编号**：slotCount 给总槽数，slots 只列非空物品，emptySlots 列全部空槽索引；两者恰好覆盖 `[0,slotCount)`，无重复、无遗漏。inventoryStart/end 标识窗口内玩家背包半开区间，不假定与玩家默认窗口同号。空槽不再逐项返回 `{slot:n,item:null}`。

非空 slots 直接返回精简物品对象（含 slot/name/count），仅有特殊 NBT／组件／损耗时附详情。满耐久、零损耗、空 NBT／空组件均省略。cursor 仅在鼠标持物时返回；它不是可点击的独立窗口槽位。内部完整窗口、物品对象和落盘记忆不被修改，原始 id/source/properties 不在本查询输出中。window.output 仍是精简结构的 JSON，供只读取 output 的当前 Brain 使用，不能只替换为不含物品的摘要。

炉子的可见燃料和烧炼进度改为 fuelPercent／progressPercent（0..100，1 位小数），省略原始 fuelTicks/totalFuelTicks/progressTicks/totalProgressTicks。未收到属性时不猜零值。其他工作站保留对应已实现的语义状态，本轮不声称已逐站实测。其他工作站操作命令的历史完整回执不在本次 window 查询格式变更范围。

| 实测场景 | 服务端独立对照及结果 |
| --- | --- |
| 无窗口／关窗后查询 | 正确返回 No window open |
| 单箱 | 63 槽，容器 0..26、玩家背包 27..62；服务端箱子 Items 与非空 slots 的编号、名称和数量一致 |
| 特殊物品／满耐久省略 | 箱内 cobblestone 32、损耗 7 且附魔 efficiency III 的钻石镐、满耐久石铲；损耗／附魔保留，石铲只有 name/count/slot |
| 玩家背包区域 | 快捷栏 oak_log 9 在箱子窗口槽 54，未与容器槽混淆 |
| 光标拿起／放回 | click 0 后 cursor=cobblestone 32，emptySlots 新增 0，服务端箱子该槽为空；再点回后物品恢复，cursor 字段省略 |
| 空炉子 | 39 槽，0 输入／1 燃料／2 产物为空；玩家背包从 3 开始，空槽与非空槽完整分区 |
| 燃烧与烧炼 | 服务端加入 raw_iron 3、coal 1；查询条形进度与 lit_time_remaining/lit_total_time、cooking_time_spent/cooking_total_time 对照。一次采样显示 99%／8.5%，随后服务端为 1582/1600、19/200；因相邻时间采样按 3 个百分点容差检查，不声称同 tick 完全相等 |
| 烧炼完成 | 输出槽出现 iron_ingot，窗口槽位、数量与服务端炉子 Items 一致 |

最终实机日志 `steveX/runs/api-acceptance-server/window-1792673229007.json`，脚本 `runs/api-acceptance-server/window-live.cjs`。首轮 `window-1792673196494.json` 箱子已通过，但测试用 mojangson 对空列表的表示与 prismarine-nbt.simplify 不兼容，炉子阶段提前退出；已在测试解析器规范化空列表并完整重跑，不将首轮视作炉子业务失败或通过证据。

自动回归 130/130 通过，覆盖全部槽位分区、满耐久省略、特殊组件保留、光标、完整内部窗口不变、炉子比例与未知属性。已关闭窗口、清理临时箱子／炉子及本轮物品，测试玩家返回本轮开始前的位置。服务继续运行，未提交或推送。

### 2026-10-22 背包剩余空槽

inventory 与 `/state` 新增 `emptySlotCount`，文字追加 `Empty slots: N`。只统计主背包＋快捷栏的玩家库存区域（通常 36 槽），不含盔甲、副手、合成格、箱子或炉子格。开窗时以当前窗口 inventoryStart/end 为准，避开旧缓存。部分堆叠仍算占用一槽，不将其可叠加数量换算为空槽；满背包明确返回 0，槽位布局未知时省略字段而不猜 36。

自动回归 131/131 通过，覆盖空包 36、占两槽 34、开箱背包区域、满包 0、装备与副手不计入，以及 state/命令一致。服务已重启加载。

### 2026-10-22 玩家与方块搜索验收

- `findplayer <name>`：用户名大小写不敏感、子串匹配，精确同名优先但不排除其他子串匹配；返回 players 列表和精确 position，文字坐标保留一位小数。只使用客户端玩家列表与实体追踪，无显式半径参数；远处仍可列出名字，但 loaded=false 且省略 position，不猜测坐标或断言一定因为太远。
- `findblock <blockName> [radius]`：精确方块注册名（不是子串），接受 minecraft: 前缀及大小写；默认 32，严格整数 1..128。只搜索已加载区块，返回一个匹配方块的整数坐标。距离以玩家所属方块坐标（向下取整）为起点计算三维欧氏距离，含边界；不是视线检测，可找到墙后已加载方块，不属于纯视觉观测。
- 修复：拒绝 8abc、小数、0、超限半径；空气 ID=0 不再误报未知；统一搜索与展示的方块网格距离。玩家新增结构化结果，未追踪位置省略，文字不再误报“太远”。

实机：Minecraft 1.21.11，两个临时玩家 FQAlpha/FQAlphaTwo 与定点矿石。验证混合大小写、多个匹配、精确名称优先、无匹配、远处位置不可用、玩家离线移除；玩家正负小数坐标与服务端 Pos 一致。方块覆盖水平距离 3/8、垂直 4、对角 5、非整数距离 sqrt(17)、半径内外与边界、默认半径、最近方块移除后找到下一个、空气、负坐标及非法参数。所有断言通过。跨维度玩家追踪、最大半径实机压力与未加载区块边界仍待测。

日志：`steveX/runs/api-acceptance-server/find-1792673763240.json`；脚本：`runs/api-acceptance-server/find-live.cjs`。首轮日志 find-1792673611228.json 在玩家传送包尚未同步时比较坐标而中断，已补等待实际坐标同步并完整重跑，不将该首轮当作业务缺陷。自动回归 133/133 通过；临时玩家已断开，临时方块已清理，测试玩家恢复原位置。未提交或推送。

### 2026-10-22 查询接口 LLM 调用验收准备

状态：已准备，真实模型调用待 API key 配置；不得据此标记 LLM 验收通过。已有游戏实测结论不变。

- 脚本：`scripts/query-llm-acceptance.js`，默认只输出计划；`node scripts/query-llm-acceptance.js --live` 才调用模型和本地游戏查询。
- 覆盖 13 个 query：自然语言选择接口、指定参数、执行查询、中文解读。只允许预期只读命令通过校验后执行，拒绝动作、多行、附加参数及错误范围；不启动 Brain。
- 默认最多 26 次模型请求，无自动重试；实际费用按供应商计费。日志保存在忽略目录 `runs/query-llm/<时间戳>.json`，包含请求、模型原文、实际查询结果与待复核解读，不保存 key。
- 选择与参数可自动判定；解读必须人工对照原返回，检查数字、单位、未知值、省略字段、last known、加载范围与非视觉限制，不用模型自评冒充通过。无开窗时 window 应诚实解释失败；成功开窗解读、正负例和多轮纠错需后续扩展。
- 发现并修复提示词信息缺口：Brain 命令表原来只有调用格式，现加入已有 description；未改变自主行动策略。本验收另提供查询限制说明，故其成绩不能直接等同于完整 Brain 自主任务成绩。
- 离线自动回归 134/134 通过，仅证明代码与校验器回归；未发起付费模型调用。

### 2026-10-22 查询接口 LLM 首轮真实验收

模型 `deepseek-v4-flash`，真实发起 26 次请求；13/13 接口选择与参数校验通过，13 份解读经本对话逐项对照原始返回，当前样本未发现事实误读。日志：`steveX/runs/query-llm/1792674238214.json`。不是完整 Brain 自主任务或无提示泛化成绩：选择阶段提供全部 query 说明与限制，解读阶段输入完整结构化返回，任务问题也包含部分边界提醒。

实际观测：pos 主世界负坐标；hp 20/20 无吸收；hunger 20、饱和度 20 last known；oxygen 未知 null；inventory 空包 36；nearby 16 格无匹配；survival；xp 0 级 0%；time 白天及月相；weather 晴；window 未开窗 HTTP 400；findplayer 匹配 piggy985 但未追踪位置；findblock 8 格未找到钻石矿。模型正确区分 0、null、空结果和查询失败，没有因未开窗执行打开动作，也未编造玩家坐标。

边界：天气回答解释了未来变化时间未知，但本轮稳定晴天不能证明其理解客户端天气渐变滞后；有物品／组件的背包、成功开窗、已知氧气、附近多实体排序、找到方块及玩家坐标等 LLM 解读仍需补场景。hp 对省略吸收值的说法偏保守，未编造数值。本轮不把这些未覆盖路径标记通过。

安全配置已用当前 Windows 用户 DPAPI 加密保存于 Git 忽略目录；未在日志记录 key。修复 PowerShell 读取加密文本末尾换行导致的解密失败（Trim 后读取）；该失败未发起 API 请求。没有自动重试，没有启动自主 Brain，没有提交或推送。

## 16. 下一轮人工验收安排

已测基础动作默认不重复，除非代码／版本／环境改变。下列是待办，未完成前保持未勾选：

- [ ] P0 物品链：hotbar、equip、unequip、use/release；分别验证物品与按键状态，别混用窗口和背包槽。
- [ ] P0 箱子链：open→window→click/moveslot/putaway→close；transfer 槽位修复已过自动回归，仍须人工核对。每次对比物品总数与组件。
- [ ] P0 采集链：dig→collect，确认方块消失不等于掉落已进背包；测试取消。
- [ ] P0 制作与建造：craft 的执行次数／产物数量、是否需工作台；equip→lookat→place；不把任意面放置视为已实现。
- [ ] P1 寻路链：goto 平地／绕障／无路→stop；follow 玩家移动／离线→stop。
- [ ] P1 生存：饥饿后 eat、经验增减查询、sleep/wake；死亡／重生另设隔离任务。
- [ ] P1 工作站人工复核：按第 8 节逐站签字，优先炉子输入／燃料取回、高炉／烟熏炉、满背包和材料不足。
- [ ] P2 载具、鞘翅、创造工具、命令方块、资源包：单独场景，确认权限及回退后执行，不在基础生存任务里顺带试。
- [ ] P2 管理与观测：配置备份／reload／断线重连、多 agent 独立状态、共享相机切换、各 NBT 数据源、跨维度及压力测试。
- [ ] API 固定脚本通过后，再做同一任务的 LLM 调用验收；分别记录参数理解、工具反馈、规划与执行问题，不提前归因为架构。

### 每次验收记录模板

```text
命令/子操作：
日期、执行人、代码版本、Minecraft/Mineflayer 版本：
agent 配置名、游戏 username、世界/维度（不写密钥）：
前置条件、材料/装备、精确调用：
调用前状态与预期：
原始返回值/错误体：
游戏实际变化、调用后状态：
独立证据（人工观察/服务端查询）及时间差：
结果：通过 / 部分通过 / 失败 / 跳过（原因）
日志/截图位置、未覆盖边界、后续修复：
```

验收顺序可由环境调整；危险动作不能只因为出现在清单中就自动授权执行。除下述明确修复项外，其他源码风险仍仅登记，不能视为已修复。

### 2026-10-22 首批修复记录

- 修复 `src/commands/actions/transfer.js`：不再使用硬编码 9..44 或独立背包缓存，改用当前窗口的半开区间 `[inventoryStart, inventoryEnd)`；包含快捷栏最后一槽。
- 数量拒绝部分数字字符串、小数、非正数和不安全整数；名称精确匹配优先；传递所选物品 NBT；拒绝非空光标和无效窗口范围。
- 新增 `test/transfer.test.js`，5 项自动回归覆盖不同窗口布局、末槽、容器物品不能当作源、默认数量及非法输入。`npm test` 为 97/97 通过。测试采用替身，不代表真实服务器点击已通过，也未证明所有现代物品组件都能正确区分。
- 本轮未启动游戏或连接服务器；检查时本机 8090、25301 均无监听。未提交、推送或合并。
- 下一次人工验收：准备单箱、双箱、漏斗和可丢弃石头。先停 Brain，将石头分别放在主背包和快捷栏最后一槽；依次 `open` → `window` → `transfer stone 1` → `window` → `inventory` → `close`，核对源减少 1、目标增加 1、总数不变。另测数量不足、满箱与光标持物，失败后先检查实际槽位再决定重试，避免重复搬运。
