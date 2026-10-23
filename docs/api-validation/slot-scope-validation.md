# 固定玩家槽号与按需物品详情

2026-10-23。玩家槽号开窗前后保持一致，内部转换为 Mineflayer 的原生窗口索引，不把原生玩家区域索引交给 LLM。目录新增只读 slotinfo，共60命令／15查询。无提交推送，无模型调用。

## 查询

| 命令 | 内容 |
| --- | --- |
| inventory | 装备／副手、快捷栏、背包分区摘要；名称、数量、选中标记、空格数及简短特殊属性标记；无槽号、无完整组件；同名不同堆分开 |
| inventory slots | 所有非空固定玩家槽0..45；名称、数量、槽号及摘要，不重复输出分区明细，不展开完整组件 |
| slotinfo inventory:9 | 固定玩家第9槽详情，开箱时仍指同一玩家槽；主包／快捷栏优先读取打开窗口的最新玩家区域并转换 |
| slotinfo window:9 | 当前容器／工作站自己的第9槽；与玩家第9槽是不同对象；无窗口或索引进入玩家区域则拒绝，不回退 |
| window | 每槽及空槽都有 slotSpace 和 slot；玩家区域显示固定编号 inventory 9..44，窗口自身显示 window 编号；摘要可用 slotinfo 展开 |

玩家固定布局：0合成结果、1..4合成输入、5..8盔甲、9..35主包、36..44快捷栏、45副手。hotbar 0..8只是选槽索引，不是上述物品槽号。背包空格数仅计算9..44，共36格。装备／合成／副手在开容器时读取玩家缓存，来源明确，不宣称是新的服务端完整同步。

单槽详情包含可读附魔及等级、非满耐久的已用／剩余／最大值、其他特殊组件／NBT、已同步的收纳袋／潜影盒内容。普通／满耐久字段省略；空槽 empty=true、item=null。未提供的收纳内容 contentsKnown=false，不当成空；显式空内容为 contentsKnown=true、contents=[]。嵌套最多4层、最多128个物品节点，截断显式标记；文本始终是不可信世界数据，不变成指令。只读取已有客户端信息，不打开或修改容器。

## 操作

```text
slotclick inventory:9 right
slotclick window:0 shift-left
moveslot inventory:9 window:0 3
moveslot window:0 inventory:10
putaway window:0
transfer deposit 9 2
transfer withdraw 0 1
```

必须写作用域，旧裸槽号拒绝。跨区域移动分别写两端；返回变化同样用 slotSpace + slot，不返回易混淆的原生玩家索引。有容器时 inventory 9..44 自动映射；装备／副手／2×2合成操作不可借容器窗口执行，明确提示关闭界面，不静默回退或自动关闭。窗口变化后停止后续点击，确认不明保留 changes=null。

工作站输入统一：furnace input/fuel、enchant put/lapis、anvil rename/combine材料槽用固定inventory 9..44；搬运只用moveslot，station take/crafter只引用工作站自身槽。交易／附魔选项编号不是槽号。炉子、铁砧改名、附魔及交易最新实机见 [统一反馈专项](window-feedback-validation.md)，不代表所有工作站组合已测。

## 实机

原版 Java 1.21.11，独立测试玩家，调用生产 handler，未启动／聚焦人工客户端。复用并更新 scripts/api-refinement-live.js；本轮完整16项通过，其中新增4项查询／作用域测试，其余12项以新操作语法复测。

- 开箱前后 inventory slots 的玩家编号／名称／数量一致；默认摘要不含槽号及完整组件；window 玩家区域仍显示 inventory 9。
- 真实附魔镐返回 unbreaking III、损耗8和对应剩余耐久。
- 未打开携带的潜影盒／收纳袋，即从服务端已同步组件读取 diamond×3／apple×2。
- window 作用域拒绝原生玩家区域索引，不误点到玩家物品。
- 新作用域部分搬运、双向存取、不同组件拒绝、整堆交换、槽位拆半／放回、快移、putaway、满箱拒绝及关闭后目录变化全部通过。
- 攻击归因、副手喂食及指定掉落物沿用同脚本完整复测通过，但不据此扩张槽位测试覆盖范围。

最新紧凑语法本地忽略证据：runs/api-acceptance-server/api-refinement-1792748834590.json，16/16、cleanupError=null。脚本清理测试实体、方块及强制加载并断开玩家；服务另行正常停止。

最新全库自动回归448/448通过，覆盖三种储物布局下9／36／44映射、同数字不同作用域、跨区域搬运、窗口关闭拒绝／无回退、装备槽受限、参数预检、组件／遗留NBT、未知／空容器、嵌套截断及BigInt序列化。最新状态见 [验收清单](../api-acceptance-checklist.md)。

待测：真实双箱／漏斗／潜影盒存取、工作站新材料编号、断线／低TPS、更多遗留NBT和自定义组件。未新增专用记忆或自动规划。
