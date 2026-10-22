# steveX
一个基于 Mineflayer 的 Minecraft LLM Agent 框架，支持多 Agent 管理、79 个命令、Web 面板实时监控。

> 运行时采用 Mineflayer，已加入 Brain 生命周期与动作仲裁修复，以及可选的后台共享 Fabric 观测端。[运行说明与验收记录](docs/integration-runtime-render.md)。

> 已迁入按 agent 隔离的 NBT 查询与可选记忆复原调试，不引入 DSH。[NBT API 与调试指南](docs/nbt-memory-debug.md)。

> 分支收拢采用保留历史的合并，旧研究路线通过归档标签保留。[分支与历史说明](docs/branch-consolidation.md)。

> **项目定位：** 构建一套 **以"版本控制"与"群体进化"为核心的多智能体系统架构**，在 Minecraft 虚拟环境中探索 AI Agent 的前沿技术。

![design](./docs/images/design.png)

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置

编辑 `configs/defaults/app.json`

### 3. 启动

```bash
npm start
```

---

## 功能特性

### 命令系统（79 个命令）

- **Actions（58 个）** — 动作指令：移动、挖掘、建造、交互、合成等
- **Queries（15 个）** — 环境查询：位置、血量、背包、附近方块/实体等
- **Creative（6 个）** — 创造模式：飞行、物品栏编辑等

所有命令自动加载，详见 [`src/commands/`](src/commands/)。

特殊工作站、村民交易及当前窗口查询见 [Mineflayer 工作站 API](docs/mineflayer-workstations.md)。

逐项人工验收见 [API 分类清单、调用参数与测试状态](docs/api-acceptance-checklist.md)。

### 多 Agent 管理

支持同时管理多个 Minecraft 机器人，每个 Agent 独立配置 Minecraft 连接和 LLM 参数。

### Web 面板

打开 http://localhost:8090 查看状态、启停 Agent、发送聊天命令和查看实时日志。

---

## 研究探索

原 Fabric GPU 视觉采集与 MemoryWorld 原型通过
[`archive/research-visual-world-model-2026-10-21`](https://github.com/piggy4/steveX/tree/archive/research-visual-world-model-2026-10-21)
标签保留。当前主线由 Mineflayer 执行玩家动作，可选共享 Fabric 渲染与独立记忆复原调试；不引入旧 DSH 运行时。
迁移内容和未完成项见 [迁移核查](docs/research-migration-parity.md)，同学接手见 [Fabric 交接文档](docs/fabric-handover.md)。

研究范围和主线边界见 [`docs/research/visual-world-model.md`](docs/research/visual-world-model.md)，
项目贡献者见 [`CONTRIBUTORS.md`](CONTRIBUTORS.md)。

---

## 多 Agent 配置示例

```json
{
  "agents": [
    {
      "name": "steveX-1",
      "minecraft": {
        "host": "localhost",
        "port": 25565,
        "username": "steveX-1",
        "auth": "offline",
        "version": false
      },
      "llm": {
        "provider": "deepseek",
        "apiKey": "YOUR_KEY_1",
        "model": "deepseek-v4-flash",
        "baseUrl": "https://api.deepseek.com/v1/chat/completions",
        "timeoutMs": 20000
      }
    },
    {
      "name": "steveX-2",
      "minecraft": {
        "host": "localhost",
        "port": 25565,
        "username": "steveX-2",
        "auth": "offline",
        "version": false
      },
      "llm": {
        "provider": "deepseek",
        "apiKey": "YOUR_KEY_2",
        "model": "deepseek-v4-flash",
        "baseUrl": "https://api.deepseek.com/v1/chat/completions",
        "timeoutMs": 20000
      }
    }
  ]
}
```


## 技术栈

| 技术 | 用途 |
|------|------|
| Node.js ≥18 | 运行时 |
| CommonJS | 模块系统 |
| mineflayer ^4.37.1 | Minecraft 机器人库 |
| mineflayer-pathfinder ^2.4.5 | 寻路插件 |
| Express ^5.2.1 | Web 框架 |
| ws ^8.20.1 | WebSocket 实时推送 |
| DeepSeek API | LLM 调用 |
