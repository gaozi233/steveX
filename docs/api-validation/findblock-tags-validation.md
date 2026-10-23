# 方块名称、原生标签与状态验收

2026-10-23。`findblock <blockName|#tag> [radius]` 保持默认半径 32、整数 1..128。精确名称查类型，标签来自当前服务端原生 tags 同步包；省略标签命名空间时默认 minecraft。不是自建用途词典，没有子串或未知标签回退。

```text
findblock oak_log 32
findblock #minecraft:logs 32
findblock #minecraft:beds 32
findblock tags log
findblock tag #minecraft:logs
```

所有状态均参与匹配，返回实际 block、position、distance、radius、properties；不向 LLM 输出数字类型／状态 ID。床可能返回床头或床尾；occupied=false 不等于可睡。logs 标签不等于天然树木，也不判断是否应砍。无需增加服务器权限，无视线或遮挡过滤；仍只搜索客户端已加载区块。

目录子命令只读取同一份服务端标签缓存，不访问位置／区块或移动：tags [filter] 按标签名称子串筛选，最多50个名称和成员数量；tag <#tag> 最多128个可读方块名，不展开状态。返回 mode/source/total/returned/truncated；未识别注册项报告 unresolvedCount，不猜名字。有效空标签返回空数组，未知标签返回错误。超出上限明确提示截断，列表可缩小 filter。本轮目录功能有自动回归，未重新做游戏或模型调用，以下9项仍是此前世界搜索的实测证据。

标签未同步：TAG_DATA_UNAVAILABLE；未知标签：UNKNOWN_BLOCK_TAG；未知精确名称：UNKNOWN_BLOCK。有效但为空的标签和范围内无匹配均成功返回 found=false。标签更新替换旧内容，断线清理，不跨 bot 共享。

## 实机：9/9

Java 1.21.11，独立 Find-Tag-Test，关闭 Brain，无 LLM 调用、无 GUI 客户端。使用生产 findblock handler；不冒充网页全链路。原生标签在连接配置阶段实际收到，未在夹具里手工注入。

| 场景 | 核对 |
| --- | --- |
| 橡木／白桦／云杉原木，各一项 | 同一个 #minecraft:logs 查询匹配各自实际名称，axis=x |
| 红床，#minecraft:beds | 不受颜色限制，occupied=true 仍能找到 |
| 白床，精确名称 | occupied=false，返回实际部位和朝向 |
| 白床，#beds | 默认 minecraft 命名空间，正确返回白床 |
| 橡木楼梯，east/top/含水 | 具体名称不变，朝向、上半及含水属性正确 |
| 橡木楼梯，north/bottom/不含水 | 同一名称匹配另一状态组合 |
| 橡木半砖，top/含水 | 返回 type=top、waterlogged=true |

每项用服务端 execute if block 对返回坐标及完整 properties 作独立核对。首轮早于服务端监听完成而连接拒绝，不算验收结果；服务就绪后完整九项通过。记录：本地忽略的 runs/api-acceptance-server/findblock-tags-1792738485631.json，脚本同目录 findblock-tags-live.cjs。结束清除测试方块／水及强制加载，断开测试玩家。

## 自动测试与限制

自动回归覆盖原生标签缓存、空标签、未知／未同步标签、更新和断线清理，以及不同床部位／颜色／状态、楼梯形状与含水属性；最新全库结果见验收清单。新功能不提供状态筛选语法，也不自动挑选“合适”的目标。其他协议、数据包重配置、128 范围压力和其他标签仍待扩展。
