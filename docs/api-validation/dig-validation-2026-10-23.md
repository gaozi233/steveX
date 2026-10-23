# 统一挖掘入口验收

## 调用与边界

- `dig`：只挖准星方块，4.5 格射线，不移动。
- `dig <x> <y> <z>`：安全整数方块坐标；已在挖掘距离内不要求路径器，超距时受保护接近；不挖路、搭柱或垫块。到达后重新检查目标、转向，并拒绝被其他方块遮挡的目标。
- `dig stop`：立即取消活动挖掘及其接近过程，不排队、不取消无关移动。已发生的破坏不会撤销。

独立 mine 入口及其 skill 注册已移除，无兼容别名。不自动选工具、规划采集链或拾取掉落物。

## 执行反馈

三种调用均使用 `action: dig` 及统一 `ok/status/confirmed/target/changes/evidence`。合法执行另有 `mode`（crosshair/coordinates/stop）、`phase`（preflight/approach/aim/dig/stop）、`approachAttempted` 和 `approached`。

`approached` 只表示接近阶段完成，不表示挖掘成功；就地挖掘时为 false。参数错误在执行前返回 INVALID_ARGUMENTS 和规范 usage，不产生控制副作用。

破坏成功必须有服务端方块更新和实际类型变化。失败区分未加载、不可挖、路径器未就绪、路径失败、目标变化、遮挡、未确认破坏及取消。执行阶段异常的 `changes: null` 表示结果未知，不代表零破坏；开始挖掘前拒绝则为 `changes: []`。停止反馈的 confirmed 只指客户端停止请求，不确认服务端没有后续变化。

## 自动覆盖与待测

自动覆盖参数形态和非法坐标、大小写 STOP、旧入口移除、准星／坐标共用破坏确认、近距离不寻路、受保护接近及设置恢复、接近取消、目标变化和遮挡拒绝。既有动作执行器测试覆盖 dig stop 不取消无关移动。

## 真实游戏验收：6/6 通过

2026-10-23，原版 1.21.11 服务端，独立 Dig-Test／dig-test，HTTP 8092；Brain 和渲染关闭，不调用 LLM，不操作原有 8090／8091 玩家。只在预先检查为空的高空区域搭建临时平台和障碍。

| 场景 | 核对结果 |
| --- | --- |
| 近距离坐标挖掘 | 目标变为空气，approachAttempted=false；HTTP 位移小于 0.05 格，服务端 Pos 保持 (6000.5,80,6005.5) |
| 无参准星挖掘 | 原木破坏，mode=crosshair，水平位移小于 0.05 格 |
| 远处坐标挖掘 | 自动接近后破坏，approachAttempted/approached 均为 true；服务端 Pos 到达约 (6009.423,80,6005.5) |
| 近距离遮挡 | TARGET_OBSTRUCTED；不移动，目标原木和基岩墙保留，changes=[] |
| 基岩完全封闭目标 | PATH_NOT_FOUND、phase=approach；原木及围墙保留，等待后未继续破墙 |
| 接近途中 dig stop | 确认实际开始移动再停止；原动作 CANCELLED、phase=approach，目标保留；沉降后再观察 1 秒，水平位移小于 0.1 格 |

通过 RCON 的 execute if block 和 data get entity 核对方块及位置；本地证据为 `runs/dig-acceptance/dig-1792731989978.json`，脚本为同目录 `live.cjs`，均不提交。只收到 ok:true 不算通过。

首轮前三项通过，遮挡项失败：脚本放墙后立即发命令，客户端可能尚未收到墙体更新。增加 350ms 同步等待后完整重跑六项通过；这是夹具同步修正，不是绕过遮挡断言，也不代表接口能读取未同步的服务端方块。

本轮未改生产代码，临时方块、掉落物和测试背包已清理。仍待服务端权限保护拒绝、低 TPS、动态目标变化、更多工具／材质和复杂地形；不宣称全量挖掘兼容。
