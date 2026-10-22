# 旁观模式兼容修复（2026-10-22）

## 更新检查

本轮经 npm registry 核对：Mineflayer 4.39.0、prismarine-physics 1.11.1、minecraft-data 3.117.0、mineflayer-pathfinder 2.4.5 均为各自 latest 发布版，安装版本一致，无 Minecraft 相关发布版可升级。未切换 GitHub master 或引入未发布依赖；未修改锁文件。npm outdated 还列出了 Express 和开发类型／编译器更新，与旁观物理无关，本轮不顺带升级。

同时核对 [Mineflayer 开发分支](https://github.com/PrismarineJS/mineflayer) 和 [prismarine-physics 开发分支](https://github.com/PrismarineJS/prismarine-physics)：飞行能力、flyingSpeed、飞行期间重力与液体处理已有开发中实现，不能将开发文档视作本地已发布版本的能力，也不能据此断言完整旁观 no-clip 已发布。

## 原因与修复范围

发布版 physics.simulatePlayer 未区分旁观模式，仍进行普通重力、流体与碰撞处理；Mineflayer 发布版也未向此物理状态传入完整的飞行能力。服务端将玩家设为 spectator 后，本地仍可能下落。

新增 `src/agent/spectator_compat.js`，由 Agent 在内置插件后加载：

- 仅匹配 Minecraft 1.21.11 和 prismarine-physics 1.11.1，且仅在当前 gameMode=spectator 时使用兼容分支。
- 旁观模式无重力、无实体方块碰撞和流体作用；沿用 PlayerState 的 apply、Mineflayer 的物理时钟和移动包发送，不停用 physicsTick 或重写发送定时器。
- 读取服务端 abilities.flyingSpeed；水平输入按现有 yaw 约定处理，jump/sneak 为上升／下降，使用飞行惯性与阻尼。
- 其他模式原样委托原物理函数；不修改 gravity 等共享参数，不污染切回生存后的行为。断线移除能力监听并恢复原函数。
- 没有实现旁观鼠标滚轮调速、附身其他实体，也没有声称完整原版逐 tick 一致；本补丁只解决本轮实际出现的基本旁观悬空和移动兼容问题。

这是可删除的局部兼容层，不是新物理引擎。将来升级 prismarine-physics 后版本门禁自动不再应用此补丁；升级时必须复验旁观悬空／移动及生存重力，确认上游覆盖后删除兼容文件及注册，不能盲目扩大版本门禁。

## 验证

`test/spectator_compat.test.js` 覆盖空闲悬空、不查询碰撞世界、水平与竖直输入、服务端飞行速度、左右方向、其他模式委托、断线清理、未验证 Minecraft 版本不应用。

本轮自动回归：104/104 通过。实机使用原版 1.21.11 本地独立服务端，SteveX-Test：

1. spectator 定点悬空，连续服务端／HTTP 查询保持 y 不变。
2. 穿过现有玻璃墙及柱内水体，保持高度，不受水流和气泡作用。
3. 左右移动、jump 上升、sneak 下降。
4. 切回 survival 后从地面上方 2.5 格释放，正常下落至 y=-60。
5. 恢复 survival，返回 `(100.5,-60,8.5)`，不移动人工账号。

原始脚本为本机忽略的 `runs/api-acceptance-server/spectator-live.cjs`，最终日志 `spectator-1792670127103.json`；查询为相邻时间采样，不把小于 0.2 格的容差检查表述成同 tick 完全一致。未提交或推送。
