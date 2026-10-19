'use strict'

/**
 * NBT 查询 API 演示 / 冒烟脚本。
 *
 * 用法：
 *   node scripts/nbt-query-demo.js                  # 合成夹具（五个数据源全都有）
 *   node scripts/nbt-query-demo.js <visionRoot>     # 对真实落盘目录跑同一组查询
 *   node scripts/nbt-query-demo.js --keep           # 合成夹具用完后保留（打印路径）
 */

const path = require('node:path')

const NBT = require('../test/nbt/helpers')
const { createNbtQueryApi, QueryError } = require('../src/nbt')

const TASK = 'demo-task'
const TS = 1760000000000

// ==================== 合成夹具（与 mod 写入格式同形） ====================

function buildFixture(root) {
  // ① entities_union.nbt（单文件、按维分桶）
  NBT.writeNbtFile(path.join(root, 'entities_union.nbt'), NBT.compound({
    currentDimension: NBT.string('minecraft:overworld'),
    worlds: NBT.compound({
      'minecraft:overworld': NBT.compound({
        updatedAt: NBT.long(TS),
        entities: NBT.compound({
          'uuid-diamond-1': NBT.compound({
            id: NBT.int(101),
            type: NBT.string('minecraft:item'),
            pos: NBT.list(NBT.T.DOUBLE, [NBT.double(-10.5), NBT.double(63), NBT.double(20.2)]),
            onGround: NBT.bool(true),
            item: NBT.compound({ id: NBT.string('minecraft:diamond'), count: NBT.int(3) })
          }),
          'uuid-stone-1': NBT.compound({
            id: NBT.int(102),
            type: NBT.string('minecraft:item'),
            pos: NBT.list(NBT.T.DOUBLE, [NBT.double(30), NBT.double(64), NBT.double(-5)]),
            onGround: NBT.bool(true),
            item: NBT.compound({ id: NBT.string('minecraft:stone'), count: NBT.int(64) })
          }),
          'uuid-zombie-1': NBT.compound({
            id: NBT.int(103),
            type: NBT.string('minecraft:zombie'),
            pos: NBT.list(NBT.T.DOUBLE, [NBT.double(5), NBT.double(65), NBT.double(8)]),
            onGround: NBT.bool(true),
            living: NBT.compound({ baby: NBT.bool(false), pose: NBT.string('standing'), onFire: NBT.bool(false) })
          })
        })
      }),
      'minecraft:the_nether': NBT.compound({
        updatedAt: NBT.long(TS),
        entities: NBT.compound({
          'uuid-piglin-1': NBT.compound({
            id: NBT.int(104),
            type: NBT.string('minecraft:piglin'),
            pos: NBT.list(NBT.T.DOUBLE, [NBT.double(1), NBT.double(70), NBT.double(1)]),
            onGround: NBT.bool(false)
          })
        })
      })
    })
  }))

  // ② terrain_union/（分片目录）
  const terrain = path.join(root, 'terrain_union')
  NBT.writeRegion(terrain, 'minecraft:overworld', 0, 0, 'blocks', NBT.compound({
    '3,62,4': NBT.compound({ block: NBT.string('minecraft:diamond_ore'), state: NBT.compound({}) }),
    '4,62,4': NBT.compound({ block: NBT.string('minecraft:stone'), state: NBT.compound({}) }),
    '-40,10,31': NBT.compound({ block: NBT.string('minecraft:deepslate_diamond_ore'), state: NBT.compound({}) }),
    '5,15,5': NBT.compound({
      block: NBT.string('minecraft:deepslate_diamond_ore'),
      state: NBT.compound({ waterlogged: NBT.string('false') })
    })
  }), TS)
  NBT.writeIndex(terrain, { 'minecraft:overworld': { '0,0': TS } })

  // ③ biomes/（quart 键，值是 biome id 字符串）
  const biomes = path.join(root, 'biomes')
  NBT.writeRegion(biomes, 'minecraft:overworld', 0, 0, 'cells', NBT.compound({
    '0,15,8': NBT.string('minecraft:plains'),
    '-10,15,5': NBT.string('minecraft:desert')
  }), TS)
  NBT.writeIndex(biomes, { 'minecraft:overworld': { '0,0': TS } })

  // ④ containers/（区文件 + ender.nbt 全局桶）
  const containers = path.join(root, 'containers')
  NBT.writeRegion(containers, 'minecraft:overworld', 0, 0, 'containers', NBT.compound({
    '10,20,30': NBT.compound({
      typeId: NBT.string('minecraft:chest'),
      block: NBT.string('minecraft:chest'),
      state: NBT.compound({ facing: NBT.string('north') }),
      items: NBT.list(NBT.T.COMPOUND, [
        NBT.compound({ slot: NBT.int(0), item: NBT.compound({ id: NBT.string('minecraft:diamond'), count: NBT.int(2) }) }),
        NBT.compound({ slot: NBT.int(1), item: NBT.compound({ id: NBT.string('minecraft:torch'), count: NBT.int(5) }) })
      ])
    })
  }), TS)
  NBT.writeIndex(containers, { 'minecraft:overworld': { '0,0': TS } })
  NBT.writeNbtFile(path.join(containers, 'ender.nbt'), NBT.compound({
    version: NBT.int(1),
    enderInventory: NBT.compound({
      items: NBT.list(NBT.T.COMPOUND, [
        NBT.compound({ slot: NBT.int(3), item: NBT.compound({ id: NBT.string('minecraft:stick'), count: NBT.int(1) }) })
      ])
    })
  }))

  // ⑤ block_entities/（_pose.nbt 也在目录里——装载器必须跳过它）
  const blockEntities = path.join(root, 'block_entities')
  NBT.writeRegion(blockEntities, 'minecraft:overworld', 0, 0, 'blockEntities', NBT.compound({
    '5,6,7': NBT.compound({
      typeId: NBT.string('minecraft:sign'),
      block: NBT.string('minecraft:oak_sign'),
      state: NBT.compound({ rotation: NBT.string('0') }),
      nbt: NBT.compound({}),
      timestamp: NBT.long(TS)
    })
  }), TS)
  NBT.writeIndex(blockEntities, { 'minecraft:overworld': { '0,0': TS } })
  require('node:fs').writeFileSync(path.join(blockEntities, '_pose.nbt'), Buffer.from('not an nbt file'))
}

// ==================== 逐条查询并打印 ====================

async function run(api, title, params, note) {
  console.log(`\n=== ${title} ===`)
  console.log('params   :', JSON.stringify(params))
  if (note) console.log('说明     :', note)
  try {
    const out = await api.query(params, { taskId: TASK })
    console.log(`matched  : ${out.matchedCount}（截断前总数）`)
    console.log(`returned : ${out.result.length}`)
    console.log(`version  : ${out.sourceVersion}`)
    console.log('result   :')
    console.log(JSON.stringify(out.result, null, 2))
  } catch (e) {
    if (e instanceof QueryError) {
      console.log(`FAILED   : code=${e.code}\n           ${e.message}`)
      return
    }
    throw e
  }
}

async function main() {
  const args = process.argv.slice(2)
  const explicitRoot = args.find((a) => !a.startsWith('--'))
  const keep = args.includes('--keep')

  let visionRoot = explicitRoot
  let temporary = false
  if (!visionRoot) {
    visionRoot = NBT.makeTempDir('stevex-nbt-demo-')
    buildFixture(visionRoot)
    temporary = true
    console.log(`[demo] 合成夹具：${visionRoot}`)
  } else {
    console.log(`[demo] 使用真实数据目录：${visionRoot}`)
  }

  const api = createNbtQueryApi({ visionRoot })

  await run(api, '1) entities：找附近的钻石掉落物（§3.3 的示例形状）', {
    path: 'entities',
    filters: {
      type: 'minecraft:item',
      'item.id': 'minecraft:diamond',
      'pos.x': { min: -64, max: 64 }
    },
    fields: ['uuid', 'pos', 'item.count'],
    limit: 8
  }, '嵌套路径 item.id + 坐标糖 pos.x；missing 字段不匹配')

  await run(api, '2) terrain：所有钻石矿（block 枚举并集）', {
    path: 'terrain',
    filters: {
      block: ['minecraft:diamond_ore', 'minecraft:deepslate_diamond_ore']
    },
    fields: ['pos', 'block'],
    limit: 10
  }, '隐式字段 pos 可筛可投影')

  await run(api, '3) terrain：limit 截断（matchedCount 仍是截断前总数）', {
    path: 'terrain',
    filters: { block: ['minecraft:diamond_ore', 'minecraft:deepslate_diamond_ore'] },
    fields: ['pos'],
    limit: 1
  })

  await run(api, '4) terrain：空结果 vs 失败（空结果不是失败）', {
    path: 'terrain',
    filters: { block: 'minecraft:emerald_ore' },
    fields: ['pos', 'block']
  })

  await run(api, '5) biomes：原点附近的 quart cell', {
    path: 'biomes',
    filters: { 'quart.x': { min: -16, max: 5 }, 'quart.z': { min: -5, max: 10 } },
    fields: ['biome', 'quart']
  }, 'quart 是 quart 坐标（1 quart = 4 格），不是方块坐标')

  await run(api, '6) containers：普通容器（items 整列投影）', {
    path: 'containers',
    filters: { scope: 'container' },
    fields: ['pos', 'block', 'items']
  }, 'v1 无数组量词：items 只能整列投影，不能筛 items[].id（审阅点 4）')

  await run(api, '7) containers：末影箱（无 pos / dim）', {
    path: 'containers',
    filters: { scope: 'ender' },
    fields: ['items']
  })

  await run(api, '8) block_entities：告示牌', {
    path: 'block_entities',
    filters: { typeId: 'minecraft:sign' },
    fields: ['pos', 'block', 'timestamp']
  }, 'timestamp 是 long → number（无 BigInt）')

  await run(api, '9) 装载错误：path 只收五个数据源标识', {
    path: 'vision/terrain_union',
    fields: ['pos']
  })

  console.log(`\n[demo] 缓存条目数（(taskId, path) 钉住）：${api.cacheSize()}`)
  api.releaseTask(TASK)
  console.log(`[demo] releaseTask 之后：${api.cacheSize()}`)

  if (temporary) {
    if (keep) console.log(`[demo] 夹具保留在：${visionRoot}`)
    else {
      NBT.removeDir(visionRoot)
      console.log('[demo] 夹具已清理（--keep 可保留）')
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
