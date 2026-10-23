# 目标选择、窗口操作与反馈验收

2026-10-23。当前目录仍为 59 个命令，未合并不同控制层级；新增目标／数量参数及按状态暴露，未添加自动任务分解、最优装备选择或专用记忆。

## 当前输入

```text
attack <entityName|id>
collect [entityId]
interactentity <entityName|id> [normal|at] [hand|off-hand]
swing [hand|off-hand]
slotclick <slot> [left|right|shift-left]
moveslot <sourceSlot> <destSlot> [count]
putaway <slot>
transfer <deposit|withdraw> <sourceSlot> [count]
```

attack 不再默认攻击最近实体；3 格及遮挡检查，无寻路或敌我判断。collect 省略 ID 仍用最近掉落物，不按用途选物。interactentity 默认 normal／hand；主手 normal 村民／容器矿车复用原生开窗，副手此路径拒绝；其他实体副手交互保留潜行状态。

槽号一律是当前窗口／背包槽号，先查 window 或 inventory，不是快捷栏 0..8。moveslot 指定数量必须到空槽或同组件堆；省略数量可整堆移动或交换不同物品。transfer 省略数量为整堆，仅选择一个源槽；存入／取出不跨来源堆、不搜索名称，只有储物窗口暴露。空间不足提前拒绝，不自动丢溢出。putaway 自动选择背包兼容／空槽，但拒绝自动获取合成／交易结果。

数字 slotclick 按钮、swing right/left、旧 transfer 名称参数格式移除。right 与窗口点击不合并，保留工作站专用接口、putaway 和 moveslot 各自边界。共享目录标明基本控制与辅助技能；wake／respawn 仅按观测到的睡眠／死亡状态向 Brain 暴露，显式白名单也不能绕过状态门控。在线判断不因 health=0 直接停止 Brain；真实死亡重生流程仍待测。

## 反馈与命中含义

- 以 status、confirmed、evidence 为准；公开 right／interactentity 移除重复 requested／confirmation 别名。请求成功不等于效果成功。
- attack 的 hit=true：等待窗内匹配目标的服务端 damage_event，且伤害来源指向自身。hit=false：检查拒绝且未发送攻击。hit=null：已发送但没有可靠归因证据，不是已确认未命中。
- 等待窗口为 1000ms；单独受伤动画、目标消失、挥手及超时均不构成命中证据。不读取隐藏目标血量；本次服务端 Health 查询只在验收脚本中作独立核对。
- 协议没有逐击事务 ID，其他自己造成的同期伤害也可能共享归因；多人并发、低 TPS 不宣称严格逐击因果确认。
- 槽位操作先后同步服务端库存，返回实际变化的 before／after 槽位与光标，而不是整份背包。只确认接口定义的槽位效果，不推断任务完成。
- 失败／取消保留观测到的部分变化；快照未知为 changes=null。中断时可能光标仍持物，不自动丢弃或盲目重试，先查 window。

## 实机 12/12

原版 Java 1.21.11 隔离存档，独立 API-Refine-Test 玩家；调用生产命令 handler，不冒充 HTTP／网页／LLM 全链路。无模型调用，无人工客户端启动或聚焦。

| 项目 | 独立核对与结果 |
| --- | --- |
| 指定目标攻击 | hit=true；服务端目标 Health 确实下降 |
| 副手辅助实体右键 | 喂牛小麦 2→1；服务端 InLove>0；接口仍仅声明请求 |
| 无敌目标攻击 | hit=null、confirmed=false，不误报命中或确定未命中 |
| 部分 moveslot | 源 8→5，箱槽 0→3；返回双方变化，服务端箱子含 stone |
| deposit／withdraw | 指定源槽分别存 2、取 1；服务端箱子数据可核对 |
| 组件隔离 | 有自定义名 stone 不能通过部分搬运并入普通 stone |
| 整堆交换 | 省略 count，dirt 与 stone 正确交换，mode=swap |
| 槽位左右键 | right 拆半，left 放入目标；返回光标变化并最终清空 |
| 快移及放回 | shift-left 映射原生快移；putaway 返回实际变化 |
| 满箱拒绝 | DESTINATION_FULL；源数量不变，changes=[] |
| 按窗口暴露 | 关闭箱子后 Brain 不再提供 transfer |
| 指定掉落物 ID | 选择较远 diamond 实体，不替换为近处其他物品；自身拾取及库存 +2 确认 |

最终原始证据：本地忽略的 `runs/api-acceptance-server/api-refinement-1792743700415.json`。复测脚本：`scripts/api-refinement-live.js`，依赖既有本地测试服和忽略目录中的 RCON helper，不包含密码。脚本清理测试方块、实体、强制加载并断开测试玩家。

首轮测试全邻区加载等待超时，后改为等待夹具目标区块及传送确认；随后死牛在客户端实体缓存短暂保留，补上实体移除等待。新增拾取初测路径被先前箱子夹具影响，移除该箱子并重新定位后完整复测通过。这些轮次不计通过，不据此更改生产寻路策略。

## 自动回归与待测

全库自动回归当前 403/403；覆盖参数先拒绝、目标复核、伤害来源／错误目标过滤、取消监听清理、组件选择、空间不足、部分失败／取消保留光标、正式 Agent 取消后保留证据、窗口变化后停止点击、服务端未改变时不报完成，以及状态化目录。

仍待测：双箱／漏斗／潜影盒实际搬运、工作站特殊输入／输出槽、低 TPS、多人同时伤害、更多实体和副手交互、真实睡眠及死亡重生。完成当前 12 项不代表这些边界通过；最新状态统一见 [验收清单](../api-acceptance-checklist.md)。
