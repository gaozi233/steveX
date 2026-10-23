# 查询、移动与采集合成：参数和错误契约

更新：2026-10-23。覆盖 36 个命令：14 query、11 motion、4 gather、6 inventory，加 interactentity；当前共 67 命令。dig 统一准星、坐标和停止三种用法；move 兼容乘坐时方向控制，jump glide 请求展翅。其他入口未声明完成契约迁移，窗口槽位操作使用 slotclick。正式调用仍为单条空白分隔字符串。

## 单一校验入口

`src/commands/command_contract.js` 保存参数数量、格式、范围和规范 usage。命令加载器将该 usage 用于 LLM、网页和生成文档；模块直接调用、已注册 skill 和正式 Agent 调用使用同一校验规则。分类说明来自 `catalog.js`，不额外向 LLM 注入完整验证代码或专用规划逻辑。

Agent 在入队、停止 Brain、清控制键之前校验；包括 `stop`、`dig stop` 的快速通道。非法动作不执行 handler，不停止当前动作，也不占动作队列。执行时依然保留原有前置条件与服务端结果确认。

## 参数规则

| 命令 | 数量及校验 |
| --- | --- |
| pos / hp / hunger / oxygen / inventory / gamemode / xp / time / weather / window | 严格 0 个参数 |
| stand / stop / collect | 严格 0 个参数 |
| jump | 0..1；normal 默认，glide 请求空中展开鞘翅；不保证已滑翔 |
| rightclick | 0..1；hand/off-hand，默认 hand；一次世界右键。副手方块自身激活返回 HAND_NOT_SUPPORTED；活动使用须先 rightup，窗口内须 slotclick |
| dig | 仅无参、stop 或 3 个安全整数值坐标；stop 大小写不敏感；无参不移动，坐标超距时受保护接近，再校验准星遮挡与目标状态；1.0 等整数值可用 |
| interactentity | 1..2；一个实体名称片段或数字 ID，normal/at 默认 normal；不支持带空格名称 |
| nearby | 0..2；第 1 位为单个过滤词，第 2 位为整数 radius 1..128；单独数字不会自动解释成半径，应写 nearby all 32 |
| findplayer / follow | 严格 1 个玩家名称／片段；原有大小写不敏感匹配不变，follow 仍要求精确用户名 |
| findblock | 1..2；精确注册名及可选整数 radius 1..128 |
| recipes | 严格 1 个精确物品注册名 |
| look | 严格 2 个有限十进制弧度；pitch 在 -PI/2..PI/2 |
| lookat / goto | 严格 3 个有限十进制坐标，绝对值不超过 Number.MAX_SAFE_INTEGER；不替调用者规划路线或保证世界边界可达 |
| move | 1..2；control 为 forward/back/left/right/sprint，durationMs 为数字串形式整数 1..30000；不接受 sneak |
| sneak | 严格 1 个 on/off/tap；大小写不敏感；tap 固定 150ms，已按住则不释放；保持状态与移动分离 |
| swing | 0..1；hand 只能 right/left，不再将拼写错误悄悄变成 right |
| wait | 严格 1 个数字串形式的正安全整数 physics ticks；不新增最大等待时长，仍受动作时限约束 |
| craft | 1..4；物品注册名、整数执行次数 1..64、auto/hand/table、正安全整数目录编号；编号不接受 0／前导 0 |
| equip | 1..2；精确物品注册名、可选 hand/head/torso/legs/feet/off-hand，默认 hand |
| hotbar | 严格 1 个整数索引 0..8；拒绝 2abc 等部分数字 |
| unequip | 0..1；目的地同 equip，默认 hand；空间不足拒绝，不自动扔物品 |
| rightdown | 0..1；hand/off-hand，默认 hand；右键持续使用手持物，仅确认请求，不保证进食、格挡或发射效果 |
| rightup | 严格 0 个参数；松开当前使用，不区分主副手；仅确认请求 |
| drop | 1..2；精确注册名、可选正安全整数数量；省略为首个匹配堆叠数量，指定数量也不混用不同组件 |

使用状态与运动分开：move/jump/look/lookat/stand/goto/follow、wait 和查询保留使用；切换物品与互斥交互动作仍释放，stop／超时／取消保持完整安全停止。rightup 按动作队列执行，不新增抢占。保持使用不代表格挡效果已确认，须结合方向及后续状态；覆盖摘要见 [背包与持续使用](api-validation/inventory-use-coverage.md)。

有限坐标和角度接受十进制科学记数法，不接受 0x／Infinity／NaN／部分数值字符串。duration、radius、times、ticks 和 recipeIndex 不接受指数或小数写法。枚举值大小写不敏感，会先规范为小写；注册名允许 minecraft: 前缀及大小写，不接受其他命名空间。没有引入通用引号／具名参数／多条命令支持。

## 统一失败格式

所有进入这些接口的失败结果均有 `ok:false`、`errorCode`、`error`、`output`。error 和 output 带 `[错误码]` 前缀，LLM 读取文本也能识别原因；output 保留原有详细反馈。参数错误额外返回规范 usage，已知时返回 argument 字段，不回显整段用户参数。

```json
{
  "ok": false,
  "errorCode": "INVALID_ARGUMENTS",
  "error": "[INVALID_ARGUMENTS] hand must be right | left. Usage: swing [hand]",
  "output": "[INVALID_ARGUMENTS] hand must be right | left. Usage: swing [hand]",
  "usage": "swing [hand]",
  "argument": "hand"
}
```

参数错误统一为 INVALID_ARGUMENTS。其他代码说明：

| 类别 | 代码与语义 |
| --- | --- |
| 查询条件 | NO_WINDOW、UNKNOWN_BLOCK、UNKNOWN_ITEM、RECIPE_CATALOG_UNAVAILABLE |
| 目标／资源状态 | NO_TARGET、TARGET_NOT_LOADED、TARGET_CHANGED、TARGET_NOT_DIGGABLE、UNSUPPORTED_ITEM、NO_DROPPED_ITEMS、PLAYER_NOT_TRACKED |
| 寻路 | PATHFINDER_NOT_READY、PATH_NOT_FOUND、PATH_TIMEOUT、PATH_INTERRUPTED、PATH_NOT_REACHED；规划失败不等于数学上证明无路 |
| 动作确认 | DIG_NOT_CONFIRMED、PICKUP_NOT_CONFIRMED；原 craft 与内部方块／实体放置具体业务码保留；rightclick 普通交互请求可 ok:true、confirmed:false，须读 confirmation/status 区别真实效果 |
| 生命周期 | NOT_CONNECTED、DISCONNECTED、CANCELLED、ACTION_TIMEOUT；使用结构化超时标记，不靠英文消息猜测动作是否超时 |
| 未细分异常 | QUERY_FAILED／ACTION_FAILED；保留原错误，不冒充已知缺材料、无路径或零效果 |

找不到匹配玩家／方块／实体仍可 `ok:true` 加空结果，不把正常空查询改成异常。未知状态的 null／? 和饱和度 last known 语义不变。六个 gather 接口保留 action/status/confirmed/target/changes/evidence；非法参数确认尚未开始，changes=[]，craft 另保留 phase=preflight／effect=none。已经执行后的失败或取消仍可能有变化，不强行改成空数组。

合成候选列表、nextQuery、部分完成数量、已知库存差值和未知库存 null 均保留；外层超时覆盖错误码时也不丢内部部分效果。未知命令／空命令等分发前错误不属于某个已选中的接口；HTTP 命令体为空或不是字符串时统一返回 INVALID_ARGUMENTS，不触发 .trim 类型异常。

## 验收

- `test/command_contract.test.js` 新增 40 项：31 接口数量校验、非法数值／枚举／命名空间、规范化、skill 一致性、错误归一化幂等、保留部分效果、无效动作不影响调度、超时与 HTTP 输入类型。
- 全库 256/256 自动测试通过；旧 wait 替身测试改为检查结构化失败，而不是依赖原始异常抛出。原先使用非法空参数的调度替身改为合法调用，仍验证原有队列／取消行为。
- 原版 1.21.11 HTTP 实测 8 组通过：31 接口拒绝多余参数、15 组非法值、14 查询调用形式、空结果与未知注册项、非法 stop 不打断而合法 stop 可取消、合法基础动作与大写枚举、无效合成零消耗及 HAND 合成 4 木板、批量合成取消仍保留实际消耗与部分产出且无延迟继续执行。窗口未打开时按 NO_WINDOW 计为预期失败，不称为成功开窗。
- 批量取消时，逐次配方确认计数可能为 0，但最终服务端库存已确认产出 4 木板、消耗 1 原木；这两个指标不是同一概念，不能用 completedExecutions=0 断言没有效果。错误归一化保留该事实，并避免重复叠加 [CANCELLED] 前缀。
- 最终本地证据 `runs/api-acceptance-server/command-contract-1792692879291.json`，原始日志不提交。未重新跑全部游戏物理／物品变体，也未重新调用付费 LLM；本轮重点是契约和执行入口。测试后清空测试物品、停止动作并恢复朝向，未控制人工玩家。
- 未提交、未推送。逐项历史记录见 [API 验收清单](api-acceptance-checklist.md)，执行效果语义见 [采集合成结果契约](gather-build-contract.md)。
