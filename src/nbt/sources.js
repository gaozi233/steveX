'use strict'

const { QueryError } = require('./errors')

/**
 * 五个数据源的记录集定义（docs/nbt查询api设计方案.md §4.1）。
 *
 * 约定：
 *   - 单文件源：`extract(root)` 直接产出记录数组；
 *   - 分片源：`extractRegion(root, dim)` 逐区产出；`extractEnder(root)` 处理全局桶（仅 containers）。
 *   - 隐式字段（`pos` / `uuid` / `dim` / `quart` / `scope`）在这里合成，文件里没有它们。
 *   - 结构不符 = SOURCE_CORRUPT（§7：不产出"看似空的"结果）。
 */
const SOURCE_PATHS = Object.freeze([
  'entities',
  'containers',
  'block_entities',
  'biomes',
  'terrain'
])

const POS_KEY = /^-?\d+,-?\d+,-?\d+$/
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

function corrupt(message) {
  return new QueryError('SOURCE_CORRUPT', `unexpected NBT structure: ${message}`)
}

function asObject(value, what) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw corrupt(`${what} is not a compound`)
  }
  return value
}

function asArray(value, what) {
  if (!Array.isArray(value)) throw corrupt(`${what} is not a list`)
  return value
}

/**
 * NBT 没有 boolean：mod 的 `putBoolean` 写出的是 TAG_Byte（1/0），读回来是 number。
 * 记录集里声明为 boolean 的字段在数据源层归一（§4.1：`onGround`；`living` 的三个布尔子键）。
 * 非数字值原样保留——`living` 子键的各类型实施期细核，别在这里硬猜。
 */
function toBoolean(value) {
  return typeof value === 'number' ? value !== 0 : value
}

function normalizeEntityBooleans(entry) {
  if (hasOwn(entry, 'onGround')) entry.onGround = toBoolean(entry.onGround)
  const living = entry.living
  if (living !== null && typeof living === 'object' && !Array.isArray(living)) {
    for (const key of ['customNameVisible', 'baby', 'onFire']) {
      if (hasOwn(living, key)) living[key] = toBoolean(living[key])
    }
  }
}

/** "x,y,z" / "qx,qy,qz" → [a, b, c]；格式不符 = SOURCE_CORRUPT。 */
function parseCoordKey(key, what) {
  if (typeof key !== 'string' || !POS_KEY.test(key)) {
    throw corrupt(`${what}: malformed key "${key}"`)
  }
  const parts = key.split(',')
  const coords = parts.map(Number)
  if (!coords.every(Number.isSafeInteger)) throw corrupt(`${what}: malformed key "${key}"`)
  return coords
}

const SOURCE_DEFS = {
  /**
   * 每个实体一条。源 = entities_union.nbt（单文件，不切分）。
   * 载荷：id / type / pos / motion / rotation / onGround / health / item? / nbt? / living? / cells。
   */
  entities: {
    kind: 'single',
    file: 'entities_union.nbt',
    extract(root) {
      const worlds = asObject(root.worlds, 'entities.worlds')
      const records = []
      for (const dim of Object.keys(worlds)) {
        const bucket = asObject(worlds[dim], `entities.worlds["${dim}"]`)
        if (bucket.entities === undefined || bucket.entities === null) continue
        const entities = asObject(bucket.entities, `entities.worlds["${dim}"].entities`)
        for (const uuid of Object.keys(entities)) {
          const entry = asObject(entities[uuid], `entities entry "${uuid}"`)
          const record = { ...entry, uuid, dim }
          normalizeEntityBooleans(record)
          records.push(record)
        }
      }
      return records
    }
  },

  /**
   * 每个容器一条。源 = containers/ 分片目录（区键 = 方块坐标）+ ender.nbt 全局桶。
   * 普通容器：载荷 = typeId / block / state / items，隐式 pos / dim / scope="container"；
   * 末影箱：只有 items，隐式 scope="ender"（无 pos / dim）。
   */
  containers: {
    kind: 'sharded',
    dir: 'containers',
    leaf: 'containers',
    enderFile: 'ender.nbt',
    extractRegion(root, dim) {
      const bucket = asObject(root.containers, 'containers.containers')
      const records = []
      for (const key of Object.keys(bucket)) {
        const entry = asObject(bucket[key], `containers entry "${key}"`)
        records.push({
          ...entry,
          pos: parseCoordKey(key, 'containers'),
          dim,
          scope: 'container'
        })
      }
      return records
    },
    extractEnder(root) {
      const inventory = asObject(root.enderInventory, 'containers.enderInventory')
      const items = inventory.items === undefined || inventory.items === null
        ? []
        : asArray(inventory.items, 'containers.enderInventory.items')
      return [{ scope: 'ender', items }]
    }
  },

  /**
   * 每个方块实体一条。源 = block_entities/ 分片目录。
   * 载荷 = typeId / block / state / nbt / timestamp，隐式 pos / dim。
   */
  block_entities: {
    kind: 'sharded',
    dir: 'block_entities',
    leaf: 'blockEntities',
    extractRegion(root, dim) {
      const bucket = asObject(root.blockEntities, 'block_entities.blockEntities')
      const records = []
      for (const key of Object.keys(bucket)) {
        const entry = asObject(bucket[key], `block_entities entry "${key}"`)
        records.push({
          ...entry,
          pos: parseCoordKey(key, 'block_entities'),
          dim
        })
      }
      return records
    }
  },

  /**
   * 每个 quart cell 一条。源 = biomes/ 分片目录。
   * 载荷 = biome（区文件 cells 桶的字符串值），隐式 quart（"qx,qy,qz" 解码）/ dim。
   */
  biomes: {
    kind: 'sharded',
    dir: 'biomes',
    leaf: 'cells',
    extractRegion(root, dim) {
      const cells = asObject(root.cells, 'biomes.cells')
      const records = []
      for (const key of Object.keys(cells)) {
        const biome = cells[key]
        if (typeof biome !== 'string') throw corrupt(`biomes entry "${key}" is not a string`)
        records.push({ biome, quart: parseCoordKey(key, 'biomes'), dim })
      }
      return records
    }
  },

  /**
   * 每个方块一条。源 = terrain_union/ 分片目录。
   * 载荷 = block / state，隐式 pos（"x,y,z" 解码）/ dim。
   */
  terrain: {
    kind: 'sharded',
    dir: 'terrain_union',
    leaf: 'blocks',
    extractRegion(root, dim) {
      const blocks = asObject(root.blocks, 'terrain.blocks')
      const records = []
      for (const key of Object.keys(blocks)) {
        const entry = asObject(blocks[key], `terrain entry "${key}"`)
        records.push({
          ...entry,
          pos: parseCoordKey(key, 'terrain'),
          dim
        })
      }
      return records
    }
  }
}

function getSourceDef(sourcePath) {
  const def = SOURCE_DEFS[sourcePath]
  if (!def) {
    throw new QueryError(
      'LOAD_ERROR',
      `path must be one of ${SOURCE_PATHS.join(' / ')} (got ${JSON.stringify(sourcePath)})`
    )
  }
  return def
}

module.exports = { SOURCE_PATHS, SOURCE_DEFS, getSourceDef, parseCoordKey }
