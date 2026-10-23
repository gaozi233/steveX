# 有界任务使用说明

2026-10-23。固定英文 system 保持原文；目标、窗口、目录、历史与追加消息位于 user，不增加每轮状态快照。游戏命令权限不变。自动生成的命令目录及 command-catalog.md 使用纯英文分类；用户目标、追加消息与历史观测原文保留，不翻译或删除中文。已有中文验收清单保留。

## 页面

- New task：新ID、目标和历史；运行或旧请求未结算时拒绝替换。
- Follow-up：默认追加，保留原目标、历史和累计预算；无任务时创建。最多20条。推理中追加使旧决策失效；执行中追加等待当前动作正常结算。
- One step：一次模型调用、最多执行一个命令后暂停，不是整个任务完成。
- Continuous：等待模型与实际命令结果后立即继续；不再等待旧 intervalMs。连续失败退避，默认3次后 blocked。
- Continue：保留目标、历史、调用预算和截止时间。
- Pause 可继续；Cancel 为终态，阻止晚到命令，取消 Brain 动作，但不撤销世界变化、不保证供应商停止计费。旧调用实际结束前不启动新任务。
- Set status 可人工声明 completed、blocked、waiting_user。completed 明示环境未验证；say DONE 不自动结束任务。

默认32次模型调用、300秒墙钟时间，暂停时间也计入。预算耗尽后需新建任务；completed、cancelled、failed 同样不能继续。目标／追加消息最多4000字符。任务仅存进程内，各 agent 隔离。历史仍保留最近10条，未做摘要、HBT、群体学习或自动规划。intervalMs 仅用于连接等待兼容，不再作为成功步骤间隔。

## HTTP（仅人工／后台，不向 LLM 暴露）

```text
POST /api/agents/:name/planner/message
{"message":"查询背包","operation":"new","mode":"once","limits":{"maxCalls":32,"maxDurationMs":300000}}

POST /api/agents/:name/planner/message
{"message":"将结果发到游戏聊天","operation":"append","mode":"continuous","taskId":"当前ID"}

POST /api/agents/:name/planner/control
{"operation":"continue","mode":"once","taskId":"当前ID"}
```

message 默认 operation=new、mode=once，兼容旧调用；append 不可修改预算。limits 还支持 maxConsecutiveFailures。control 支持 continue、pause、cancel、complete、block、wait；mode=once或continuous。可选taskId不匹配返回409，无效参数400，忙碌409。单步等待实际结果，持续模式返回started仅表示启动接受。关闭网页不停止后台任务。

页面显示任务状态、命令数、预算、模型／排队／执行／调度等待耗时、重复查询和供应商实际返回的 token usage。缺失usage标为不可用，不按字符估算、不等于零费用。重复查询只计数，不自动判断无进展。

全库481/481；HTTP模拟3/3及Edge核对通过。本轮无真实Minecraft／付费模型验收，详见[调度验收](api-validation/task-runtime-validation.md)。Key、完整运行日志和截图留在本地忽略目录。
