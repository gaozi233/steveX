# 分支收拢与历史保留

日期：2026-10-21。后续开发以 main 为主，按配置选择纯 Mineflayer、共享 Fabric 观测和可选记忆复原调试，不再为这些模式各维护一个活跃分支。

## 代码边界

- 集成从 main 的 958e7631 开始，保留 Mineflayer 的玩家、动作、寻路、击退与氧气兼容逻辑。
- 从旧分支迁入 Fabric 共享采集、NBT 查询和独立记忆复原调试，不引入 DSH 或旧的 Fabric 行动编排入口。
- 主运行时仍是基础 Brain，不代表已经实现 HBT、快慢决策或群体学习。

## 历史策略

先提交集成内容，再以 ours 策略创建一个保留旧实验分支祖先的合并提交；其文件树保持集成结果不变。experiment 已包含 research 的祖先，因此一次历史合并即可保留两条路线的提交、原作者和合并记录。这里的 ours 仅用于历史归并，不用于处理未来代码冲突。

集成 PR 使用 merge commit 合入 main，不使用 squash 或 rebase，以保留上述提交谱系。合并前复核文件树、自动测试与 Java 构建；合并成功并确认归档标签已推送后，才删除旧分支引用。GitHub Contributors 的显示由 GitHub 的默认分支统计、作者邮箱关联及后台刷新决定，不保证立即更新。

归档标签对应原分支末端：

| 标签 | 原分支 | 提交 |
|---|---|---|
| archive/research-visual-world-model-2026-10-21 | research/visual-world-model | d9ccd626fce1b6d8688c9bff44cabc6d5a0d650a |
| archive/experiment-mineflayer-fabric-render-2026-10-21 | experiment/mineflayer-fabric-render | ba4c62d1a89d2820241fd56bb3284df833cde768 |

查看旧版本可运行 `git show <标签>:<文件路径>`；需要继续探索时，从标签新建分支，不必修改 main。旧 worktree 先切换为对应标签的 detached HEAD，保留原目录和被忽略的本地运行数据，不递归删除目录。无关的本地历史分支不纳入本轮清理。

原 main 工作目录的未提交文档和图片不纳入集成提交；更新 main 仅允许快进，不使用 reset、clean 或强制覆盖。

## 验证与局限

合并前 Node 检查在原 68 项基础上新增 Brain 自发 stop 回归；两套 Fabric Mod 均应构建成功。真实共享渲染和记忆复原的验收记录见 integration-runtime-render.md 与 nbt-memory-debug.md。

尚未完成全部命令的协作取消、跨维度与长期压力验证、容器库存同步和视觉模型闭环。仍有既存 npm moderate 依赖告警；本次不做无关依赖升级。HTTP 与 Mod WS 仅用于受信任本机实验，不应暴露公网。
