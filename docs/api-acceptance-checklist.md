# API 分类清单与人工验收台账

更新：2026-10-23。按当前源码目录整理：**59 个命令（14 query、39 action、6 creative）**，另列 **15 个 HTTP 路由模板**（Brain 操作展开为两行）。分类来源为 `src/commands/catalog.js`，实际用法以运行版本的 `GET /api/commands` 为准。

本文仅保留当前接口、最新验收状态与待测项，不保留失效入口和逐轮调试流水。未提交、未推送。

分类与 LLM／网页共享目录一致：collect 属于移动控制；dig、right、attack、interactentity、swing、fish 属于世界交互与物品使用（swing 仅动画）；craft 属于背包、装备与合成；book 属于窗口与界面，say 单列通信，客户端管理单列且默认隐藏。look 现统一为 angle／at，新格式的旧实测结论不直接继承。

## 1. 状态与证据

- **实测**：当前入口有真实游戏记录，仅覆盖行内列明场景，不代表所有变体通过。
- **摘要通过**：沿用最近一次真实验收结论；原始过程日志已清理或归档，不代表本轮重新测试。
- **自动局部**：有参数、mock 或协议回归，不代表游戏效果已验证。
- **待测**：尚无对应成功路径的专项实测；已测接口的剩余边界列在末栏。
- 自动回归与真实游戏验收分开计数；统一挖掘已完成独立玩家 6 项游戏实测，未调用 LLM。其余接口不因此升级状态；新增边界见各行待测项。
- 最新全库自动回归 **403/403**（2026-10-23），目标选择／窗口反馈优化另有 12/12 实机核对，见 [接口优化专项](api-validation/api-refinement-validation.md)。原开窗 7/7、聊天书本 6 项证据分别保留；这些均不代表全部窗口材料／交易组合、低 TPS 通过。本轮无模型调用。

当前保留证据位于本地忽略目录，不随 Git 提交：

| 证据 | 最新覆盖 |
| --- | --- |
| `runs/api-acceptance-server/api-refinement-1792743700415.json` | 最新 12/12：攻击归因、副手实体交互、指定掉落物 ID、窗口搬运／点击及满箱拒绝 |
| `runs/api-acceptance-server/rightclick-1792730421694.json` | 右键内部路径历史实测 19/19：主副手放置、半砖、门床、船、刷怪蛋、潜行、喂食、弩等；不代表改名后的入口全量复测 |
| `runs/api-acceptance-server/window-native-1792739386986.json` | 新 right 入口原生开窗及动态目录 7/7；不代表窗口内操作组合全部实测 |
| `runs/api-acceptance-server/findblock-tags-1792738485631.json` | 原生标签世界搜索及方块状态 9/9；标签目录子命令仅自动覆盖 |
| `runs/api-acceptance-server/jump-duration-1792737309015.json` | 持续上浮、落地后起跳、取消松键 3/3 |
| `runs/sneak-acceptance/sneak-1792730751382.json` | 持续潜行与船／矿车上下车 12 组通过，含服务端潜行及乘客关系核对 |
| `runs/api-acceptance-server/current-commands-unit.log` | 最新全库自动回归；不替代真实游戏验收 |

旧验收仅保留有效结论，不再引用已删除 JSON。专项说明：[右键](api-validation/rightclick-validation-2026-10-23.md)、[潜行](api-validation/sneak-validation-2026-10-23.md)、[工作站](mineflayer-workstations.md)、[参数契约](command-contract.md)。专项文档中的历史轮次不覆盖本清单的最新状态。

## 2. 调用与判定

### 调用对象与 LLM 可见性

“默认可用”仅表示默认进入 Brain 工具目录，不表示测试已通过、调用必然成功或具备服务端权限；LLM 仍须主动选择命令，不会自动执行查询。

| 分类／接口 | 调用对象 | LLM 可见性（默认配置） |
| --- | --- | --- |
| 第 3 类：除 window 外的 13 个查询 | LLM、网页人工、外部程序 | **默认可用** |
| 第 3 类：window | LLM、网页人工、外部程序 | **按需暴露**：存在容器／工作站窗口或本地书本 UI 时出现 |
| 第 4 类：移动控制全部 9 个 | LLM、网页人工、外部程序 | **默认可用** |
| 第 5 类：世界交互全部 6 个 | LLM、网页人工、外部程序 | **默认可用** |
| 第 6 类：背包装备合成全部 5 个 | LLM、网页人工、外部程序 | **默认可用** |
| 第 7 类：slotclick、moveslot、putaway | LLM、网页人工、外部程序 | **默认可用**：无容器窗口时可操作自身背包；本地书本 UI 打开时隐藏 |
| 第 7 类：close | LLM、网页人工、外部程序 | **按需暴露**：有容器／工作站窗口或本地书本 UI 时出现 |
| 第 7 类：transfer | LLM、网页人工、外部程序 | **按需暴露**：仅受支持的储物窗口（箱子、漏斗、潜影盒等），书本及工作站不暴露；执行时仍检查 |
| 第 7 类：book | LLM、网页人工、外部程序 | **按需暴露**：持书 right click 打开本地书本 UI；已签名书只显示 read／done，不显示 write |
| 第 8 类：furnace、anvil、enchant、trade | LLM、网页人工、外部程序 | **按需暴露**：仅当前窗口类型对应的命令；不是看到工作站就自动暴露 |
| 第 8 类：station | LLM、网页人工、外部程序 | **按需暴露**：仅受支持的工作站窗口；select 仅织布机／切石机，crafter／beacon 仅各自窗口 |
| 第 9 类：wake、respawn | LLM、网页人工、外部程序 | **按需暴露**：观测到睡眠时显示 wake，health<=0 时显示 respawn；执行时再次检查，白名单不绕过状态 |
| 第 10 类：say | LLM、网页人工、外部程序 | **默认可用**：可发送 /命令，是否获准由 Minecraft 服务端决定；实验角色不应授予 OP |
| 第 11 类：客户端管理全部 4 个 | 人工／后台；显式配置后也可供 LLM 使用 | **仅人工／后台使用（默认）**：不进入默认 Brain 目录 |
| 第 12 类：创造与特权全部 7 个 | 人工／后台；显式配置后也可供 LLM 使用 | **仅人工／后台使用（默认）**：包括 kind=action 的 setcommandblock |
| 第 13 类：全部 HTTP 路由及 WebSocket | 网页、人工脚本、后台／外部程序 | **仅人工／后台使用**：Brain 未接入通用 HTTP、共享渲染或记忆查询工具 |

- 这里的“按需”由当前窗口／书本或睡眠／死亡状态决定，不是模型申请权限。Brain 每轮刷新目录，状态变化后仍以执行时检查为准。
- `allowedCommands` 是显式名称白名单，会替代默认可见性筛选，可开放管理／特权命令，但不绕过角色命令集合、窗口／恢复状态条件或 Minecraft 权限；它不会把 HTTP 路由变成 LLM 工具。
- 网页／手动目录保持完整，不随 Brain 的窗口状态裁剪。外部程序经 HTTP command 路由发送命令字符串；HTTP 接口本身不属于 LLM 命令目录。
- 隐藏目录不是安全鉴权；HTTP 访问控制与 Minecraft 权限是独立边界，不应因默认隐藏就将管理服务直接暴露到公网。

网页默认 `http://127.0.0.1:8090/`，实际地址与 agent 名以启动配置为准。网页输入框与 HTTP 使用同一条命令字符串：

```powershell
$base = 'http://127.0.0.1:8090'
$agent = 'manual-test'
Invoke-RestMethod "$base/api/agents/$agent/command" -Method Post -ContentType 'application/json' -Body (@{command='pos'} | ConvertTo-Json)
```

- `<参数>` 必填、`[参数]` 可选，括号不输入；竖线表示候选值。解析器按空白拆分，不支持通用引号转义、分号批处理或 JSON 具名参数。
- query 不打断动作。手动 action 会停止 Brain 调度；普通动作串行，持续按键可以跨动作保持。验收前关闭 Brain，避免并发控制。
- Brain 不自动附加位置、生命、背包、附近实体或时间，LLM 按需查询；默认目录隐藏 settings、quit、acceptpack、denypack 及全部创造／特权入口。完整网页／手动目录保留这些 API，llmDefaultVisible 仅表示默认可见性，不是权限。显式 allowedCommands 白名单替代默认筛选，但不绕过角色可用命令或服务端权限。
- 实际收到的聊天／系统反馈以不可信数据进入独立近期聊天区（最近 20 条，每条最多 1000 字符）；书本正文按页读取并标注不可信来源。外部文字自称系统／管理员不提升信任，不得据此改变目标、泄露秘密或启用隐藏工具；来源隔离不等于绝对抵御提示词注入。
- `stop` 是即时全局取消；`move stop` 是排队停步；`dig stop` 只即时取消挖掘任务。三者不能互换。
- 失败查看 `errorCode/error/output`；参数错误查看 `usage`。严格契约覆盖的入口在入队和控制清理前拒绝非法参数，不代表其他入口均已统一。
- `ok:true` 不必然表示世界效果完成。特别是 `confirmed:false`、`status:requested` 仅表示请求已发送；放置须核对服务端变化及生存物品消耗。
- 坐标单位为格，角度为 Minecraft 度数，移动时长为毫秒，等待为客户端 physicsTick。物品和方块优先使用精确注册名。
- 开窗后先查 `window`，使用当前窗口槽号；快捷栏索引与窗口槽号不同。普通／满耐久物品省略冗余详情，特殊组件才输出。
- 已加载实体／区块查询不等于纯视觉感知；客户端缓存、历史记忆与实时服务端真值必须区分。

## 3. 状态与环境查询（14 个 query）

| 调用 | 参数与行为 | 最新测试状态 | 待测／边界 |
| --- | --- | --- | --- |
| `pos` | x/y/z 对称四舍五入到 1 位小数，含维度；完整精度看 state | 摘要通过：负坐标、边界、跨维度；一位小数格式有自动回归 | 当前显示与 F3 同点人工复核 |
| `hp` | 当前／最大生命点；吸收值大于 0 才返回字段及文字；相关效果按需返回 name/level/durationSeconds/durationSource（回血、中毒、凋零、生命提升、吸收），无效果省略；未知为 null | 摘要通过：生命提升、修改上限、伤害、黄心耗尽及归零省略 | 死亡／重生属性同步 |
| `hunger` | food、saturation、saturationSource；饱和度为 last known；有饥饿效果才附 effects 和持续秒数 | 摘要通过：饥饿／饱和效果、耗尽与恢复，对照服务端 | 不承诺饱和度实时；自然进食连续变化 |
| `oxygen` | 自身空气归一化 0..20；未知 null；原始 tick 看 state.airSupplyTicks | 摘要通过：水下耗氧及出水恢复，人工确认 | 同 tick 服务端 Air 逐点对照；NBT 的 s 后缀不是秒 |
| `inventory` | 主包／快捷栏、非空装备及副手、主包剩余空格；特殊组件按需输出 | 摘要通过：数量、组件、耐久省略、四件盔甲与副手 | 开窗换装备；其他特殊组件 |
| `nearby [type\|name\|all] [radius]` | 默认 32，整数 1..128；已加载实体，名称／类型大小写不敏感子串；最近最多 20 个，含 ID；掉落物／展示框按需带 item.name/count，展示框 rotationDegrees，箭／三叉戟 inGround；物品名也可过滤，未知详情省略 | 摘要通过：类型、名称、半径、三维距离、排序与截断 | 新详情自动测试、实机待核对；无视线／遮挡过滤；不返回整份 NBT、生物隐藏血量或猜测射手 |
| `gamemode` | 四种模式，未知 null；不改变模式 | 摘要通过：四模式对照服务端 | 重生、跨维度同步时序 |
| `xp` | 仅 level、progressPercent，进度保留 1 位小数 | 摘要通过：经验增减、设置、升级 | 经验球、附魔／铁砧消费 |
| `time` | clock 为游戏 HH:MM，0 tick=06:00；保留 timeOfDay 与 doDaylightCycle，冻结时注明；不返回月相、天数或睡眠结论 | 新显示格式自动测试，旧时钟边界实测为摘要 | 新格式实机待核对；LLM 按需查询 weather／nearby，雷暴、怪物和床的条件不由 time 判断 |
| `weather` | clear/raining/thunder 及雨／雷强度 | 摘要通过：晴、雨、雷暴稳定状态 | 渐变、降雪和其他维度 |
| `window` | 当前窗口类型、范围、非空槽及空槽编号；按需 cursor；炉子进度 | 实测：新右键箱子开窗；摘要通过：炉子、光标、空槽、完成烧炼 | 双箱及其他工作站；关闭窗口后应拒绝 |
| `findplayer <name>` | 大小写不敏感；精确同名优先再片段；未追踪玩家省略坐标 | 摘要通过：同名片段、离线、远处未追踪、正负坐标 | 跨维度 |
| `findblock <blockName\|#tag> [radius]` / `findblock tags [filter]` / `findblock tag <#tag>` | tags 列标签名及数量（限50），tag 展开具体方块名（限128），均报告截断、不搜索世界；搜索用精确方块名或服务端同步原生标签（#minecraft:logs、#minecraft:beds）；默认 32，整数 1..128；匹配所有状态，返回实际名称、网格坐标、properties，不判断用途或可用性 | 名称／标签、不同床与楼梯／含水属性自动覆盖；实机 9/9；见 [标签与状态验收](api-validation/findblock-tags-validation.md) | 无视线过滤；标签未同步明确报错，不猜测原木类别；高范围压力、其他版本待补 |
| `recipes <itemName>` | 一个精确物品名的全部合成配方；availabilityChecked=false，不按当前材料过滤，不含烧炼 | 摘要通过：新版 DeepSeek 基础及复杂合成任务中的配方查询 | 更多动态配方；不能当作当前可执行方案列表 |

## 4. 朝向、移动与动作控制（9 个 action）

| 调用 | 参数与行为 | 最新测试状态 | 待测／边界 |
| --- | --- | --- | --- |
| `look angle <yaw> <pitch>` / `look at <x> <y> <z>` | 原版度数：yaw 0 南、90 西、-90 东；pitch 正低头。~ 在出队时相对当前角度／脚部坐标计算，俯仰相对结果限幅；不支持 ^、旧弧度或 lookat | 新格式自动测试；旧格式实测不直接算新入口通过 | 原版画面对照、低 TPS 与移动中瞄准实测待补 |
| `move <forward\|back\|left\|right\|sprint\|stop> [durationMs]` | 方向默认 1000ms，整数 1..30000；stop 无时长、排队停步并保留潜行／持物使用，不是全局急停；乘坐时方向控制载具，结束／取消清零，载具不支持 sprint；保持潜行／持盾 | 步行／潜行已有实测；载具方向及取消自动局部 | 载具实际方向、位移、stop 和低 TPS 实测；不自动防跌落 |
| `sneak <on\|off\|tap>` | on 持续、off 松开、tap 短按 150ms；已保持时 tap 不松开 | 实测：12 组含服务端潜行、转向／移动保持、工作台放置、船矿车上下车 | 已保持时须 off 再 tap 才产生新边沿；长途路径、其他载具 |
| `jump [durationMs]` | 默认 200ms，整数 1..30000；保持空格直到到时／取消松开，不等落地。仅首次按下尝试展翅，不自动使用烟花 | 时长校验、保持中落地不重发展翅、取消松键自动覆盖；真实 3/3：上浮 Y=100→105.2、落地后重复起跳、主动取消松键；见 [持续空格验收](api-validation/jump-duration-validation.md) | 低 TPS、复杂流体、鞘翅实机仍待补；持续保持可能落地后再次起跳 |
| `stop` | 即时取消活动／排队动作、停 Brain、清控制及保持状态 | 实测：潜行释放；摘要通过：等待、挖掘、寻路、跟随中断 | 原生窗口操作取消 |
| `goto <x> <y> <z>` | 方块目标向下取整，须路径器就绪；完成须核对到达 | 摘要通过：绕墙、封闭目标失败、取消及无延迟破墙 | 气泡柱、加载边界、复杂地形；超时不等于证明无路 |
| `follow <playerName>` | 精确用户名不区分大小写，约 2 格动态跟随；返回 RUNNING | 摘要通过：移动、离线、远距离卸载后松键及重新跟随 | 切换目标；卸载后不会追旧坐标 |
| `wait <ticks>` | 正整数客户端 physicsTick，不是墙钟秒数 | 摘要通过：正常等待、非法参数与 stop；新右键测试中使用 | 低 TPS、真实断线清理 |
| `collect [entityId]` | 指定已加载掉落物 ID；省略为最近掉落。自身拾取事件与库存正增量才成功，禁破坏寻路，不按用途选物 | 实测：指定较远 diamond ID，自身拾取及库存 +2；原最近目标路径有摘要实测 | 抢拾、移动目标待补；部分拾取只报告实际增量 |

## 5. 世界交互与物品使用（6 个 action）

| 调用 | 参数与行为 | 最新测试状态 | 待测／边界 |
| --- | --- | --- | --- |
| `dig` / `dig <x> <y> <z>` / `dig stop` | 无参只挖准星、不移动；坐标为安全整数，超距时受保护接近，不挖路／搭建，再瞄准校验遮挡与目标；stop 即时取消挖掘及接近，不取消无关移动 | 实测 6/6：近距离不移动、准星破坏、远处接近、遮挡／无路拒绝、接近途中停止；对照服务端 Pos 与方块；参数、目标变化和设置恢复另有自动测试 | 服务端保护拒绝、动态变化、更多工具／材质、低 TPS；依据客户端已同步方块，不自动选工具或保证拾取 |
| `right <click\|down> [hand\|off-hand]` / `right up` | click 单次准星交互／放置；down 持续使用持物，非世界连点；up 无手参数，报告 hadActiveUse、released、实际 hand，未知为 null；本地松开不等于服务端效果确认 | 点击与持续使用沿用原路径覆盖；新分发和松手反馈自动测试 | 新入口实机整组、低 TPS、其他物品待补；不继承旧名为全量复测 |
| `attack <entityName\|id>` | 必须指定目标；精确同名优先，再片段取最近；3 格、遮挡及转向后目标复核，无寻路／敌我判断。hit=true 仅服务端 damage_event 目标及来源均匹配自己；未发包拒绝为 false，发出后 1000ms 无归因证据为 null（未知，不是未命中），不读取目标隐藏血量 | 新目标、归因、取消及未知反馈有自动回归；专项记录见 [接口优化验收](api-validation/api-refinement-validation.md) | 多人同时攻击、低 TPS、特殊实体待补；时间窗不能证明本次独占因果关系 |
| `interactentity <entityName\|id> [normal\|at] [hand\|off-hand]` | 辅助转向，默认 normal／hand；4.5 格及遮挡检查，无寻路重试；副手正确发包并保留潜行。主手 normal 村民／容器矿车原生开窗，副手该路径拒绝 | 实测：副手小麦 2→1、服务端牛 InLove>0；原主手上下车／喂食有摘要 | 移动目标、at 盔甲架、剪毛／交易实机待补；非开窗请求不等于效果完成 |
| `swing [hand\|off-hand]` | 默认 hand；只发手臂动画，不是鼠标键，无任何交互；旧 right/left 参数已移除 | 内部左右挥手有历史实测；新手参数自动回归 | 新参数实机待核对；不是攻击或破坏成功证据 |
| `fish` | 持竿自动抛竿、等咬钩及收竿，不是一次右键 | 自动局部：缺竿拒绝 | 真实水面、咬钩、收竿、超时和取消 |

## 6. 背包、装备与合成（5 个 action）

| 调用 | 参数与行为 | 最新测试状态 | 待测／边界 |
| --- | --- | --- | --- |
| `equip item <itemName> [destination]` / `equip slot <slot> [destination]` / `equip <itemName> [destination]` | 名称精确匹配；默认 hand，可 head/torso/legs/feet/off-hand；槽号为关闭窗口后的背包／快捷栏 9..44。同名附魔、耐久、NBT 或组件不同返回 EQUIP_SELECTION_REQUIRED 及 candidates，不装备；相同属性忽略堆叠数量，取首槽；不选最优装备 | 原按名装备主副手及盔甲已有实测；新增槽位／候选选择 11 项自动测试通过，不冒称新路径实测 | 新入口真实附魔工具、多组件、满包及异常装备验收待补；候选是观测快照，执行时读取当前槽位，无自动回退 |
| `hotbar <slot>` | 整数 0..8，不是窗口槽号 | 实测：潜行夹具选槽；摘要通过：0/8、空手、非法参数 | 高延迟切换后使用 |
| `unequip [hand\|head\|torso\|legs\|feet\|off-hand]` | 默认 hand；满包拒绝，不自动丢物 | 摘要通过：盔甲／副手回包、空槽、满包无损拒绝 | 不可卸装备、并发库存变化 |
| `drop <itemName> [count]` | 精确名；默认首堆，显式数量只跨同组件堆，不足拒绝 | 摘要通过：丢 3 留 7、地面计数、组件隔离 | 不支持显式指定组件；不保证掉落后安全 |
| `craft <itemName> [times] [auto\|hand\|table] [recipeIndex]` | 默认 auto；times 为合成执行次数 1..64。一种当前可用方案直接做，多种返回 availableRecipes 供选择；不自动规划 | 摘要通过：新版 DeepSeek 基础 5/5、复杂 7/7，含条件拒绝后恢复 | 更多配方、取消及未知效果；失败先查 recipes，自行结合背包／箱子规划；不把未知当零产出 |

## 7. 窗口与界面（6 个 action）

| 调用 | 参数与行为 | 最新测试状态 | 待测／边界 |
| --- | --- | --- | --- |
| `slotclick <slot> [left\|right\|shift-left]` | 默认 left；right 拆半／放一件，shift-left 原生快移；操作结果槽可能合成／交易。返回实际槽位及光标变化；数字按钮格式移除 | 实测：箱内拆半、放入、快移及光标反馈；见 [接口优化验收](api-validation/api-refinement-validation.md) | 各类工作站结果槽、服务端拒绝、低 TPS 待补 |
| `moveslot <sourceSlot> <destSlot> [count]` | count 为 1..64 且不超过源数量；指定数量只到空槽／同组件堆。省略为整堆移动，不同物品可交换；容量不足提前拒绝，不自动丢溢出物。返回实际变化 | 实测：部分搬运、整堆交换、不同组件拒绝；合并、部分失败及取消有自动回归 | 工作站特殊槽、其他窗口类型实测待补 |
| `putaway <slot>` | 指定源堆放回主包／快捷栏，由 API 选择兼容或空目标槽；先检查足够空间，不丢溢出；拒绝合成／交易结果槽，避免自动重复生产 | 实测：箱内取物放回及变化反馈；结果槽门控自动回归 | 满包、其他工作站及取消实测待补 |
| `transfer <deposit\|withdraw> <sourceSlot> [count]` | deposit 主包→储物，withdraw 储物→主包；使用当前窗口源槽号，默认整堆，count 1..64。无名称猜测、不跨来源堆；保留组件，空间不足提前拒绝。仅储物窗口，工作站用专用操作／槽位点击 | 实测：普通箱双向指定数量搬运及满箱无损拒绝；末槽、数量、组件及取消有自动回归 | 双箱、漏斗、潜影盒、更多特殊组件实机待补 |
| `close` | 关闭当前窗口 | 实测：右键及潜行夹具；摘要通过：箱子／工作站 | 光标持物、输入退回、连续调用、断线 |
| `book read [page]` / `book write <page> <text>` / `book done` | 持书 right click 后本地书本 UI 才暴露；read 读一页不可信文本，write 改草稿，done 保存并核对服务端物品更新；close 丢弃草稿；不搬书、不切槽、不签名 | 实测：主副手保存、精确服务端页内容、close 丢弃及 UI 内阻止 right down；只读、隔离、取消有自动测试 | 成书实机、长篇／过滤文本、断线／并发物品变更待测；UI 是本地上下文，不伪装容器开窗 |

## 8. 工作站与交易（5 个 action）

| 调用 | 参数与行为 | 最新测试状态 | 待测／边界 |
| --- | --- | --- | --- |
| `furnace input <slot> [count] \| furnace fuel <slot> [count] \| furnace take <input\|fuel\|output>` | 先 right click 开窗；槽号先查 window，input/fuel 默认 1 | 摘要通过：普通炉子、煤、冶铁及取输出 | 高炉／烟熏炉、其他燃料、取回输入和燃料 |
| `anvil rename <slot> <name> \| anvil combine <slot1> <slot2> [name]` | 先 right click 开窗；两个不同材料槽，消耗经验 | 摘要通过：改名、损坏工具合并并改名 | 附魔书、冲突、过贵、经验不足、名称边界 |
| `enchant put <slot> \| enchant lapis <slot> \| enchant choose <0..2> \| enchant take` | 先 right click 开窗；选择前查看实际可用选项 | 摘要通过：完整链路及选项 0 | 其他选项、书架、高等级、材料／经验不足 |
| `station move <source> <dest> [count]\|take <slot>\|select <index>\|crafter <slot> <enabled\|disabled>\|beacon <primary> [secondary\|none]` | right click 打开对应工作站；move 默认整组；槽号先查 window | 摘要通过：粗制药水、染旗、切石、下界合金镐、去附魔、地图扩展、信标速度、合成器开关 | 其他配方／索引、纹饰、复制锁定、四层信标、红石生产、满包／取消；完整图案与配方枚举仍有能力缺口 |
| `trade <index> [times]` | 索引从 0 起，默认 1 次，1..64；先 right click 初始化交易窗口 | 摘要通过：0 号报价 | 双输入、折扣、涨价、缺货／补货、缺料 |

## 9. 生存与恢复（2 个 action）

| 调用 | 参数与行为 | 最新测试状态 | 待测／边界 |
| --- | --- | --- | --- |
| `wake` | 仅睡眠时向 LLM 暴露，执行再次门控；返回请求，不冒称起床完成 | 非睡眠拒绝与目录变化自动回归；成功路径实机待测 | 先用床右键入睡，核对起床位置 |
| `respawn` | 仅观测 health<=0 时暴露，执行再次门控；返回请求，不冒称重生完成 | 非死亡拒绝与目录变化自动回归；成功路径实机待测，高风险 | 自动重生可能无需此命令；Brain 在线判断不因死亡直接停止，实机恢复仅隔离存档 |

## 10. 通信（1 个 action）

| 调用 | 参数与行为 | 最新测试状态 | 待测／边界 |
| --- | --- | --- | --- |
| `say <message>` | 聊天或任意 /命令，含 OP 命令；权限交给原版服务器，私聊用 say /tell 玩家 文本。发送不等于执行／送达 | 实测：权限拒绝、命令成功、自己及其他玩家发言、私聊；实际收到的反馈进入独立不可信聊天区 | 不保证服务端发送所有反馈；模型提示词注入攻击测试待做 |

## 11. 客户端管理（4 个 action）

调用对象：人工／后台。LLM 默认隐藏；仅显式 allowedCommands 可开放，不因此取得服务器权限。

| 调用 | 参数与行为 | 最新测试状态 | 待测／边界 |
| --- | --- | --- | --- |
| `settings <key> <value>` | 布尔／数字／文本类型转换，修改客户端设置 | 待测 | key 合法性与服务端实际效果；不要任意改正式角色 |
| `quit [reason]` | 默认退出原因，断开本角色 | 命令专项待测 | 动作清理、状态及重连；不能用 HTTP 断线代验 |
| `acceptpack` | 接受服务端资源包请求 | 待测，有下载副作用 | 仅可信包，回执、失败及缓存 |
| `denypack` | 拒绝资源包 | 待测 | 可选／强制包；强制拒绝可能被踢 |

## 12. 创造与特权工具（7 个入口）

调用对象：人工／后台。LLM 默认隐藏；显式开放后仍需实际模式／权限。

此分类含 1 个 action 与 6 个 creative，全部从 Brain 默认目录隐藏，包括 kind=action 的 setcommandblock。显式 allowedCommands 可选择开放，仍需服务端权限／模式；目录可见性不是权限控制。

| 调用 | 参数与行为 | 最新测试状态 | 待测／边界 |
| --- | --- | --- | --- |
| `setcommandblock <x> <y> <z> <command>` | 修改已有命令方块；须对应权限／模式，不负责放置 | 待测，高风险 | 原生参数适配、服务端权限与实际内容 |
| `clearinventory` | 清空角色背包 | 待测，删除物品 | 专用测试角色核对装备／副手和残留 |
| `clearslot <slot>` | 清除指定玩家背包槽 | 待测，删除物品 | 合法范围及指定槽不误删 |
| `flyto <x> <y> <z>` | 直线飞行，不承诺绕障 | 待测 | 安全短距、障碍、取消、非法坐标 |
| `setinventory <slot> [itemName] [count] [metadata]` | 无物品名则清槽；数量默认 1、metadata 默认 0 | 待测，改物品 | 组件支持、数量／槽位、服务器拒绝 |
| `startfly` | 开启创造飞行／零重力 | 专项待测 | 模式权限、实际浮空与后续恢复 |
| `stopfly` | 恢复重力 | 专项待测，有坠落风险 | 安全地面、落地和模式切换 |

## 13. HTTP 与共享渲染／记忆

本节所有路由及下述 WebSocket **仅供人工／后台／外部程序调用，未作为 Brain 工具暴露**。读取 state、渲染结果或历史记忆不等于这些内容已自动提供给 LLM；经 command 路由发出的命令另按第 2 节区分可见性。

`:name` 为配置中的 agent 名。这里的状态仅针对路由本身，不把命令 handler 的通过自动算作整条 HTTP 链路通过。

| 方法与路径 | 调用与返回边界 | 最新测试状态／待测 |
| --- | --- | --- |
| `GET /api/status` | 无 body，角色状态及 uptimeSec | 摘要通过：轮询；断线／多角色刷新待扩展 |
| `GET /api/commands` | 当前 name/kind/category/description/usage 目录 | 目录自动校验；当前 59 入口的运行服务核对待重载；不是完整参数 schema |
| `GET /api/skills` | 局部 skillRegistry | 专项待测；不代替完整命令目录 |
| `GET /api/config/environment` | 读取环境配置文件，不是完整合并配置 | 待测；可能含密钥，禁止记录完整响应 |
| `POST /api/config/environment` | `{"config":{...}}`，约 512KiB 上限；写文件，不自动 reload | 待测；备份并避免覆盖密钥 |
| `POST /api/reload` | 重载配置，可断开原角色／渲染服务 | 摘要通过：重载后重连；配置失败恢复待测 |
| `POST /api/agents/:name/connect` | 按配置连接；ok 不代表已 spawn | 摘要通过：重载后重连；重复连接及未知角色待测 |
| `POST /api/agents/:name/disconnect` | 断开指定角色 | 摘要通过；运行中取消／写盘排空待测 |
| `POST /api/agents/:name/command` | `{"command":"pos"}`；失败通常 HTTP 400 | 实测：右键 19 组及潜行 12 组经正式 HTTP 入口 |
| `GET /api/agents/:name/state` | 精确坐标、属性、控制、背包等客户端状态 | 实测：右键／潜行夹具读取；不是实时服务端全知状态 |
| `GET /api/agents/:name/memory/containers` | actor/session 隔离的历史开窗记录，含来源和观测时间 | 摘要通过：开箱和落盘；历史不是当前库存，旧数据无损转换仍待完善 |
| `POST /api/agents/:name/brain/start` | 使用该角色在线状态及本地 LLM 配置 | 自动局部；摘要：缺 Key 拒绝；有效配置的路由专项待测，不读取密钥 |
| `POST /api/agents/:name/brain/stop` | 停 Brain 调度，不等同全局动作 stop | 自动局部；真实前后台动作归属待验 |
| `GET /api/renderer/status` | 关闭时 enabled=false，开启查询共享渲染服务 | 集成摘要通过、自动局部；当前运行实测待补 |
| `POST /api/agents/:name/observe` | 无必填 body；指定角色视角进入共享采集队列 | 摘要通过：alpha→beta→alpha、并发隔离；长期切换和跨维度待测 |
| `POST /api/agents/:name/nbt/query` | `{path,fields,filters?,limit?}`；path 为 entities/containers/block_entities/biomes/terrain；fields 必填非空数组，limit 默认 64、1..512 | 自动夹具／隔离／错误覆盖；各源真实查询待测；数据来自采集落盘，不是服务端透视 |

WebSocket 使用同服务端口推送状态／命令事件，不提供另一套命令执行接口；连接、事件顺序及断线恢复仍需专项验收。

## 14. 下一步待测顺序

- 容器基础：slotclick → moveslot → putaway → transfer，逐项对照服务端库存和光标，覆盖满箱／满包／特殊组件。
- 持续交互：right down/right up 的未覆盖消耗品、fish、床右键入睡与 wake。
- 动态实体与载具：interactentity 的 at、attack 范围／伤害、乘坐时 move 的方向与停止、空中 jump 展翅。
- 生命周期与高风险：respawn、quit／重连、资源包、创造及命令方块，使用隔离角色和存档。
- 渲染／记忆：共享渲染长期切换、跨维度、各类 NBT 源查询，核对角色隔离与观测时间。

以后验收直接更新对应行的最新结论与剩余边界，不再在文件顶部追加旧版数量或重复流水。原始日志留本地忽略目录，提交前排除密钥、运行日志和个人配置。
