# 统一开窗与按窗口暴露

2026-10-23。开窗归入主手 `right click`；删除独立 open/openentity/dispenser 入口，删除 furnace/anvil/enchant 的 open／无参开窗及 station open 子操作。当前完整目录见 [验收清单](../api-acceptance-checklist.md)；窗口暴露不是授权控制。

## 原生初始化

准星选择目标后只走一次路径：炉子调用 openFurnace，铁砧调用 openAnvil，附魔台调用 openEnchantmentTable，村民调用 openVillager，普通方块窗口调用 openBlock。不会先发普通点击再初始化，不自动搬运、交易、选配方、补料或寻路。

保留潜行持物时的放置优先级和主副手边界；本轮原生开窗只支持主手。容器矿车支持原生实体窗口；普通动物／载具仍走原实体交互。流浪商人、驮箱动物、载具内开包等并未声明完整适配。只有确认当前窗口对象后才反馈开窗完成；取消后到来的同一窗口关闭，不把它算成功。

## Brain 目录

每轮按该 Agent 当前窗口重新生成：无窗口仍有 slotclick/moveslot/putaway 以整理自身背包；开窗后加入 window/close/transfer；炉子、铁砧、附魔台、村民分别展示对应命令。station 只在其工作站出现，select/crafter/beacon 进一步按窗口类型展示。管理／特权隐藏及显式白名单限制保持不变。

常驻简短能力说明告诉模型通过 right click 开窗；不按任务目标替模型选择工具。未知经验／材料条件不筛选。窗口在模型请求途中变化时，执行器仍应检查实际窗口，返回 WINDOW_REQUIRED、WINDOW_TYPE_MISMATCH 或 WINDOW_NOT_READY，不自动开窗补救。完整手动目录不因 Brain 当前上下文而消失。

## 实机 7/7

独立 Window-Test，原版 Java 1.21.11 服务端；调用生产 right handler，不冒充真实 LLM 或完整网页链路。

| 目标 | 结果 |
| --- | --- |
| 箱子 | generic_9x3 打开，无工作站操作暴露 |
| 发射器 | generic_3x3 打开，无发射动作 |
| 炉子 | furnace 打开，putInput/putFuel/takeOutput 已初始化，仅暴露 furnace |
| 铁砧 | anvil 打开，rename/combine 已初始化，仅暴露 anvil |
| 附魔台 | enchantment 打开，putTargetItem/putLapis/enchant 已初始化，仅暴露 enchant |
| 织布机 | loom 打开，仅暴露适用 station 操作 |
| 村民 | merchant 原生初始化完成、2 条报价，暴露 trade |

每次关闭后核对窗口操作撤回。脚本清理临时平台、目标方块／测试村民及强制加载，玩家断开；无模型调用，不操作人工客户端。最终证据在忽略目录 runs/api-acceptance-server/window-native-1792739386986.json，脚本同目录 window-native-live.cjs。

自动回归覆盖路由选择、潜行放置、单次发送、主副手、窗口开关、Agent 隔离、白名单、取消后迟到窗口、错误窗口拒绝。未重做每种窗口内所有操作／交易／材料组合，也未覆盖低 TPS、全部实体容器和并发外部窗口变化。
