# 文档导航

## 当前接口与验收

- [API 验收清单](api-acceptance-checklist.md)：当前命令、最新测试状态与待测项，人工验收从这里开始。
- [API 验收记录目录](api-validation/README.md)：API 测试记录集中存放；保留最新实测与有效覆盖摘要，不保留重复旧轮次。
- [命令目录](command-catalog.md)、[参数与错误契约](command-contract.md)、[采集／合成／放置契约](gather-build-contract.md)、[工作站 API](mineflayer-workstations.md)。

## 架构、迁移与调试

- [Agent overview and debug pages](web-agent-pages.md): lightweight overview, per-agent routes, lazy panels and subscription disposal.

- [Fabric 同学交接](fabric-handover.md)、[迁移核查](research-migration-parity.md)、[集成运行与共享渲染](integration-runtime-render.md)。
- [NBT 记忆调试](nbt-memory-debug.md)、[旁观模式兼容](spectator-compatibility.md)、[分支整合](branch-consolidation.md)。

## 设计与历史材料

根目录的中文设计方案、任务分工及早期状态文档保留原位置，避免把研究设想误当作当前实现，也不因清理测试流水而删除设计背景。PR11 指南属于历史原型，不作为当前启动／接口验收依据；当前调用以命令目录和验收清单为准。

2026-10-23 整理：API 记录集中至 api-validation；被新版覆盖的基础／合成压力流水、旧命令迁移流水、旧 PR13／PR14 原型验收日志删除；特殊放置、背包／盾牌／消耗品边界已合并保留。原始运行数据不进入 docs。
