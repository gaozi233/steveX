# 持续潜行与上下车验收（2026-10-23）

## 当前命令

```text
sneak on
lookat 5002.5 -59 5000.5
rightclick
move forward 500
sneak off
```

- sneak on：持续按住潜行，跨普通移动、转向、右键及 stand 保持；不需反复发送。
- sneak off：松开并清理保持意图。
- sneak tap：按住 150ms 后松开，用于短按及下车。已经保持潜行时返回 changed:false，不暗中释放；需要新的按键边沿时先 off 再 tap。
- move sneak 已移除，返回 INVALID_ARGUMENTS；move 仍接受 forward/back/left/right/sprint，默认 1000ms。
- stop、动作超时／取消与断线清理保持意图与控制键；sneak off、tap 等仍按动作队列执行，不是抢占式急停。
- 上车改为准星 rightclick 或辅助 interactentity；船和矿车替代能力验证后，mount/dismount 已从源码、目录及分发表删除，不留别名。drive 提示同步更新。

当前 70 个命令（50 action、14 query、6 creative），参数契约覆盖 37 个。输入成功仍是客户端请求确认，不冒称服务端效果必然完成。

## 隔离环境

独立玩家 Sneak-Test、Agent 名 sneak-test，面板／HTTP 端口 8091，独立配置 runs/sneak-acceptance/agent.json。继续使用已有 25565 Minecraft 服务端和原有测试 RCON，不操作 manual-test／SteveX-Test 或其 8090 服务。Brain／渲染关闭，无模型调用、无密钥读取，不改全局游戏规则。

独立区域约 (5000,-60,5000)，只添加临时工作台、放置方块、轨道及带测试标签的船／矿车。结束关闭窗口、清空本测试玩家物品、删除测试对象与方块、释放控制并恢复位置和朝向。没有创建 GUI 客户端或争夺鼠标焦点。

## 实测

正式 HTTP 入口完整 12 组通过，最终证据 runs/sneak-acceptance/sneak-1792730751382.json，脚本 runs/sneak-acceptance/live.cjs；运行资料被忽略，不提交。

| 场景 | 核对结果 |
| --- | --- |
| 旧 move sneak、非法 sneak click | 参数校验拒绝，无动作副作用 |
| 不潜行右键工作台 | 实际打开 minecraft:crafting 窗口，不放手持方块 |
| on→tap→右键工作台顶面 | tap 不松开已有保持；原版服务端 is_sneaking 条件为真；工作台上方生成 1 圆石，库存 16→15，无窗口打开 |
| on→look／lookat | 服务端潜行状态持续为真 |
| on→move forward 1000→stand | 移动期间及停步后仍潜行；HTTP 坐标实际变化，潜行比同条件普通步行更慢 |
| stop／非保持 tap | stop 解除保持；短按结束不残留潜行 |
| 船，准星 rightclick | 服务端 execute on vehicle 确认乘上带测试标签的船 |
| 船，sneak tap | 服务端乘客关系解除；潜行和前后左右控制全为 false |
| 船，interactentity | 辅助定位上船与 tap 下船均通过 |
| 矿车，准星 rightclick | 同样确认实际乘坐矿车 |
| 矿车，sneak tap | 确认解除乘坐，潜行和移动键均松开 |
| 矿车，interactentity | 辅助定位上车与 tap 下车均通过 |

最终重启后的 /api/commands 已核对：70 个命令，sneak 存在，mount/dismount 缺席。测试服务已经加载新版本，原玩家与服务未重启。

潜行降低眼高，顶面瞄准应在潜行后重新 lookat；视角不会自动跟踪目标。本文只保留最终完整轮次，不保留已修正夹具的试跑流水。

## 状态与回归

src/agent/sneak_state.js 按 bot 隔离保持状态，在保持期间阻止路径器／普通 clearControlStates 发送潜行 false，避免先松开再按住的闪断；安全停止先解除保持再清控制。断线恢复原生 setter，不在玩家之间共享状态。stand 只停移动，不松开显式保持。

自动回归 318/318 通过，含保持跨命令、路径器清键无 false 脉冲、tap 不破坏已有保持、off、stop、超时释放、断线清理、双玩家隔离、旧 move sneak 拒绝，以及上下车旧入口移除。命令目录生成检查、git diff --check 通过。

未覆盖长途 goto/follow 的潜行路线、低 TPS 短按、疾跑与所有载具（马、骆驼等）、移动中抢占转向、死亡后重连；普通动作串行，持续潜行与动作并存，不代表动作队列已改为并发。drive 的中立／持续输入问题另行验收，不把本次下车键释放推及全部驾驶物理。

未提交、未推送。
