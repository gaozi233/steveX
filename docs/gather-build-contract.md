# 采集、合成与建造：结果契约与 Benchmark 用法

更新：2026-10-23。适用 Minecraft 1.21.11、当前 Mineflayer 4.39.0。命令分类及参数来自 [共享目录](command-catalog.md)，逐项证据见 [验收台账](api-acceptance-checklist.md)。

## 统一结果

第 3／4／5 类参数和失败返回已统一，详见 [参数与错误契约](command-contract.md)。参数校验发生在调度副作用之前；执行后的失败仍保留本节约定的部分结果，而非统一归零。

六个动作 `dig / mine / collect / craft / place / placeentity` 的动作结果保留 `ok/output/error`，统一增加：

| 字段 | 含义 |
| --- | --- |
| action | 命令名 |
| status | completed / failed / cancelled |
| confirmed | 整个请求是否完成且已取得所要求的确认依据；不是“命令已发送” |
| target | 已知目标及位置、放置面、工作台等；无法确定则 null |
| changes | 已观察到的方块变化或物品净增减数组；无法确认则 null，不等同于没有变化 |
| evidence | 确认依据的来源；空数组表示没有取得结果确认 |

只有 `ok=true && confirmed=true && status=completed` 才算整个请求成功。失败／取消可能已经产生部分效果，不能无条件重发。离线、未知命令等调度前的通用 HTTP 错误不属于已进入动作 handler 的结果。

确认依据：

| 接口 | 成功所需依据 | 不保证的事情 |
| --- | --- | --- |
| dig / mine | 目标坐标收到服务端 block_change / multi_block_change，并且最终目标方块类型改变 | 掉落物一定生成或进包 |
| collect | 自身收到目标的拾取事件，服务端库存快照确认物品正增量 | 一次拾取全部原堆叠；目标在移动时必然追上 |
| craft | 每批服务端库存快照的材料、产物和返还物净变化匹配配方；最终仍可确认库存 | 所有动态配方／组件配方、其他工作站配方 |
| place | 命中／相邻位置服务端状态变化与最终区块状态一致，生存物品消耗 1；门、床须两部分均有服务端确认并配对 | 其他多格方块、周围连锁更新或并发修改的完整因果关系 |
| placeentity | 预先监听新 ID、注册表匹配类型及近邻生成，库存快照确认生存模式消耗 1 | 所有实体类型、组件、碰撞与并发的严格因果归属 |

这些是客户端能接收的服务端数据，不调用服务端作弊查询。Minecraft 更新缺少每次动作的事务 ID，多玩家同时修改相同位置／相同物品时不能证明严格因果归属；`changes` 是观测差值，不是原子事务日志。物品差值按注册名聚合，不用它判断不同 NBT／组件物品的身份。

## 放置与寻路边界

放置保留准星射线的实际命中点，不自动改为方块面中心；合并半砖、叠加雪层可以在同一坐标改变同类型方块。`target.position` 为确认变化的实际坐标，方块差值附带 `beforeStateId/afterStateId`。仅本地预测、服务端原状态回复或生存物品未消耗，不算成功。当前使用 Mineflayer `_genericPlace` 原生交互发送，绕过 `placeBlock` 对同类型更新的错误拒绝；这是内部依赖接口，升级时需回归。

门必须确认 lower／upper，床必须确认 foot／head，且位置及 facing 配对；门还核对 hinge 与 open 一致。两部分均须是本次监视到的服务端状态变化，不能以旧方块或本地预测冒充另一半。`changes` 对成功的门／床列出两个方块、一个物品消耗，`target.position` 指向下半门／床尾。可读 `properties` 返回 type、waterlogged、half、part、facing 等实际方块属性，output 同步带这些事实，不替 LLM 规划朝向。

多个位置共用单组入站数据包监听器，完成后统一清理，不提高 EventEmitter 上限。实测与剩余边界见 [特殊方块放置验收](placement-special-cases-2026-10-23.md)。

只有主要部分得到确认而结构不完整时返回 `STRUCTURE_NOT_CONFIRMED`；其他未确认放置返回 `PLACEMENT_NOT_CONFIRMED`，保留已核对的库存和主要方块变化，提示先检查而非自动重试／回滚。附加观察位置不代表所有邻居变化都由本次放置引起；普通方块优先用相邻放置坐标，避免邻近楼梯形状变化使主位置选错。

2026-10-23 实测：上半砖底面合并、悬挂上半砖、侧面上半区放置；水中半砖 waterlogged=true、合并双半砖后 waterlogged=false；北向门、北／西向床；上方受阻的门及床头受阻的床不生成、不消耗。其余水生／含水方块、门床全部材质和方向、其他多格结构仍需扩展。

`mine` 与 `collect` 共用受保护寻路：禁止挖路、脚手架和搭柱，完成／无路／取消后恢复原移动设置，取消时清除寻路目标。仍允许原寻路器的其他移动能力，不承诺绝对无环境副作用（例如踩踏），也不提供自动资源规划。

## 实体放置

`placeentity` 无参数、不寻路、不自动转头或重试。船／筏使用原生 activateItem（按当前准星和流体射线使用物品）；蛋、盔甲架和水晶使用 `_genericPlace`，保留实际命中点。不是所有物品都能在任意面／底座生成。水晶只接受黑曜石和基岩；画明确拒绝。

`target` 包含实体 ID／UUID、类型、生成事件时冻结的位置及准星参考位置／面。船的实际流体命中点可能不同于忽略流体的参考方块，真实生成点以 position 为准；后续运动位置另查 nearby。多个新实体匹配时不随意认领。成功要求新生成和生存物品消耗共同确认，创造模式不要求消耗。

失败也核对库存，返回 errorCode、已观察实体、实际 changes 及可读 output；库存无法确认则 changes=null。没有生成事件不等于没有副作用：点击刷怪笼可能耗蛋、改变类型而不立即生成，此时仍不算实体放置成功。详见 [实体放置验收与错误码](entity-placement-validation-2026-10-23.md)。

准星查询对 Mineflayer 4.39.0 使用版本限定的眼高兼容修正，与 lookat 保持同一射线原点；无眼高数据时保留旧兼容路径，升级依赖须复核。

## 合成

```text
craft <itemName> [times] [auto|hand|table] [recipeIndex]

craft oak_planks 2 hand
craft wooden_pickaxe 2 auto
craft torch 2 table
```

- itemName 使用精确注册名，可带 `minecraft:` 前缀。
- times 为 1..64 的配方执行次数，默认 1；不是期望产物数量。保留旧位置参数兼容，但名称从 count 明确为 times。
- `auto` 为默认值，允许手工或已加载、可见且距眼部中心不超过 4.5 格的工作台。只有一种可执行方案时直接执行，多种时返回列表，不替调用者挑选材料。
- `hand` 仅允许 2×2 手工；`table` 必须有可用工作台，即使配方本可手工完成。
- 不自动找路、不摆放工作台、不替换材料。调用前关闭其他容器并清空光标。
- 先核对材料和容量；允许消耗材料腾出空槽，考虑堆叠上限和目录已声明的返还物。目录未声明的返还物不能完整预估，不把目录缺失当作“没有返还物”。
- 仍使用 Mineflayer 配方库和 `bot.craft`，不另写合成引擎；每次仅执行一批，等待尾随更新、请求库存同步，核对配方 delta 后才进入下一批。
- 取消不强行切断已在进行的原生点击；等待其结束、关闭本次工作台并取得最终快照，不开始下一批。若最后也无法同步，changes=null，不能把预测库存写成确认结果。
- 目前拒绝产物类型同时被消耗、导致净增量与配方产量不同的配方。修复／复杂组件动态配方不计入已支持 Benchmark 范围。

数量示例：2 次原木转木板配方消耗 2 原木，得到 8 木板；2 次铁镐配方消耗 6 铁锭、4 木棍，得到 2 把铁镐。

附加结果：`completedExecutions` 为已核对成功的批数，`producedCount` 为产物名对应的库存净增量。失败时它们可能不同步，例如一批有实际产出但取消前尚未完成批次核验；以最终确认的 changes 和库存为准，不要只用 completedExecutions 评估进度。

成功和执行中止的 output 都包含实际库存 changes，LLM 不必从“成功”二字猜测消耗。changesScope=net-inventory-by-item-name，按物品注册名聚合；不表示槽位／NBT 身份、严格因果归属或配方的理论总消耗。API 不计算任务剩余目标或下一步。

| 字段／状态 | 口径 |
| --- | --- |
| phase=preflight, effect=none | 参数／目录／窗口／同步等执行前拒绝；没有开始合成，changes=[]、completedExecutions=0、producedCount=0 |
| phase=execution, effect=observed | 已进入执行阶段并取得最终库存差值；changes 可以为空，不等于保证未点击；失败也可有实际产出 |
| phase=confirmation, effect=unknown | 最终库存无法确认；changes=null、producedCount=null，不能当作零产出；completedExecutions 只记录此前已核对次数 |

errorCode 提供机器可读类别：INVALID_ARGUMENTS、UNKNOWN_ITEM、WINDOW_OPEN、CURSOR_NOT_EMPTY、INVENTORY_SYNC_FAILED、INVENTORY_READ_FAILED、CRAFT_PREFLIGHT_FAILED，以及后文列出的配方执行条件错误；执行中可能返回 WORKBENCH_CHANGED、INVENTORY_MISMATCH、WINDOW_CLOSE_FAILED、CRAFT_EXECUTION_FAILED、ACTION_TIMEOUT、CANCELLED 或 CONFIRMATION_UNAVAILABLE。关闭工作台失败也保留实际库存变化，不丢弃已发生产出、不自动重试。调度层在进入 handler 前拒绝等通用错误仍按统一结果章节说明处理。

容量、材料不足会在点击前拒绝；执行中不匹配则返回失败及已知变化，不自动重试，也不承诺自动回滚。100ms 尾随等待不是实时性保证，成功判定依靠后续库存及配方差值核验。全局 action 超时仍适用，大批量在低 TPS 下可能被取消。

### 配方目录与执行边界

`recipes <itemName>` 是只读查询，一次返回指定精确物品名的全部客户端目录配方，包括当前背包无法执行、需要工作台或执行接口不支持的候选；不分页，不替 LLM 选方案。

```text
recipes white_bed
recipes red_bed
recipes wooden_pickaxe
```

返回 `item/source/recipeCount/recipes`，每个配方列出 index、outputCount、requiresWorkbench、ingredients（名称和单次用量）、returns 和 supportedByCraft。output 包含同一份完整配方 JSON，Brain 按需查询时能读到所有候选，不自动把配方塞进每次状态采样。

recipeType=crafting，仅查询合成目录，不包括烧炼等其他工作站工艺。availabilityChecked=false，不检查当前背包或工作台。精确名称允许大小写及 minecraft: 前缀；不接受别名、多个物品、模糊名或其他命名空间。错误返回 INVALID_ARGUMENTS／UNKNOWN_ITEM／RECIPE_CATALOG_UNAVAILABLE 和可读 output；目录读取失败不会伪装成 recipeCount=0。

Brain 历史暂时保留最近 10 条命令结果，每条保留完整文本，不再截断为 120 个字符；配方与背包查询沿用同一历史机制，不另建配方缓存。超过 10 条仍淘汰最旧记录。更细的 token 预算、摘要与长期上下文管理后续实现；完整结果会增加模型上下文用量。

- 数量均按单次配方；不同候选的产量可能不同。
- 不返回 missingMaterials、craftableNow、selected，也不根据背包数量隐藏配方，不推断箱子或记忆里是否有材料。
- 这是完整客户端目录，不是仅已解锁的玩家配方书（unlockedOnly=false）；目录可能遗漏标签替代项、自定义或动态配方。
- returns 只表示目录声明的信息。null 表示未知，不是“没有返还物”。当前目录的蛋糕未声明返还桶，不能据此否认实测的 3 个桶返还。
- index 是当前物品目录内的 1-based 编号，可作为 craft 的第四个参数 recipeIndex，必须同时填写 times 和 station；例如 `craft iron_ingot 1 auto 1`。按本机当前查询的编号选择，不把示例编号当作跨版本固定标识。指定编号后不会回退到其他材料方案。
- 必须指定精确物品名；bed 不会默认变成 red_bed。任务仅要求任意颜色床时，由 LLM 自己决定查询哪些颜色、采用哪种方案，不由 API 加入颜色约束。

### 无法执行时的事实反馈

自动合成没有当前可执行方案时返回 `RECIPE_QUERY_REQUIRED` 和 `nextQuery: recipes <itemName>`；后者只是可用的目录查询入口，不是自动执行的计划。反馈仅说明当前检查范围，不指挥如何结合背包、容器或记忆取材。不返回单候选 MISSING_MATERIALS、取材顺序或“应当去采集”的结论。

执行器内部仍要检查材料和容量，防止非法点击；这是机械执行校验，不代表资源在整个世界中缺失，也不代表选定了需要完成的子任务。

**全部目录与当前可用方案不同**：recipes 返回全部目录；craft 按本次 times、station、当前背包、可触及工作台和输出容量校验。恰好一种可执行方案时直接执行；多种可执行且未指定 recipeIndex 时返回 RECIPE_SELECTION_REQUIRED、availableRecipes 和 changes=[]，不消耗任何物品。availableRecipes 仅列当前满足执行条件的候选，沿用目录 index、单次 ingredients/outputCount，另附本批 totalOutputCount。完整候选 JSON 同时进入 output/error，Brain 能读到列表后自行选择。零种可执行时仍引导查全部配方，不能把空的当前可用集合当作世界缺料。

指定 recipeIndex 时只校验并执行该候选；无效编号返回 INVALID_RECIPE_INDEX，选中候选暂不可执行则拒绝，不偷偷换材料。候选列表是本次快照，后续请求重新检查条件。它不是服务器配方 ID，也不能保证模组／数据包更新后编号稳定。

无指定编号且零种当前可执行时 availableRecipes=[]；指定编号不可执行时不返回这个全物品空列表，避免错误暗示其他配方也不可用。hand 模式不搜索工作台，workbench={checked:false,available:null}；auto/table 模式报告本次搜索结果 checked=true、available=true/false，不能把“不检查”当成“不存在”。

其他确定的执行限制保留具体反馈，并附同样的查询提示：显式 hand 模式无法执行工作台配方为 WORKBENCH_REQUIRED；当前材料可执行方案无足够容量为 INVENTORY_FULL；目录无配方为 NO_CRAFTING_RECIPE；不支持的配方形式为 UNSUPPORTED_RECIPE。预检失败 changes=[]，已有点击后失败／取消仍可能有部分效果，不得盲目重试。

目标分解、资源分配、候选选择及失败后的调整由调用者负责。API 不计算剩余任务数量、不自动查询容器或记忆、不递归合成，也不维护专用合成记忆库；通用上下文管理是独立问题。

## 放置与采集

`place` 无新增参数，使用准星射线命中的面，支持顶／底／东／西／南／北六面。不再默认为顶面；先 lookat 到所需面再放置。方块自身放置规则、碰撞及方向规则仍由原版和 Mineflayer 决定。

`placeentity` 同样使用命中面，但必须遵守实体物品本身的规则，不意味着盔甲架能放在任意面。画仍明确拒绝；本轮仅盔甲架有真实成功证据，船／刷怪蛋／末影水晶不可当作已验收。

`mine` 接近过程中暂时关闭 pathfinder 的挖掘、脚手架与垫高能力，结束／失败时恢复设置；到达后重新检查目标 stateId 和可挖距离，避免在路上破坏别的方块或挖过期引用。`dig` 不自动挑选最佳工具。

## 本轮实测

- 主流程 17 组：手工／工作台批量、无工作台、缺料、满包拒绝、取消，六面放置、采集与实体结果契约。
- 合成矩阵 9 组：木板、木棍、工作台、箱子、炉子、石镐、批量铁镐、蛋糕（含 3 桶返还）以及满包消耗末个原木腾出槽位。
- RCON 仅用于测试夹具和独立服务端核对，不注入正式 API 返回。
- 机械接口实测日志保存在本机忽略目录 runs/api-acceptance-server；DeepSeek 真实闭环日志保存在 runs/craft-llm，具体轮次、失败与修复结果见验收台账。

### DeepSeek 闭环复测

长程、多目标和批量压力测试见 [复杂合成压力报告](craft-llm-stress.md)。craft 默认动作时限按次数为 `30000 + (times - 1) * 1000` 毫秒（1..64 次对应 30..93 秒），显式调用／runtime 时限优先。取消仍可能有部分结果；Brain 失败历史保留完整 output、completedExecutions、producedCount、changes，应该按实际库存而非仅用 requested-completed 计算补做数量。

使用 `./scripts/query-llm-acceptance.ps1 -Suite craft`，复用本机 Windows DPAPI 保存的 Key，不在命令行、配置或日志写明文 Key。默认只查看方案可运行 `node scripts/craft-llm-acceptance.js`，不会调用模型或游戏。实测需要已启动本地验收服务、空背包且无装备的 SteveX-Test，以及忽略目录中的 RCON 测试夹具。

复用生产 Brain 的提示词、历史、状态采样和解析，通过 HTTP 执行受限的 inventory/recipes/craft/say；不是开放世界自主探索验收。模型看不到 RCON 夹具数据，也没有获得原木到木镐等预写步骤。每例最多 12 次模型调用，保存提示词、回复、实际执行结果和服务端独立库存核对。结束清理物品／临时工作台并恢复坐标朝向，不操作人工玩家。

仍需补：网络抖动／低 TPS 压力、并发他人干扰、更多组件／自定义配方、工作台途中消失及更多实体类型。Benchmark 不应将这些未测条件自动纳入“全部通过”。
