'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')

/**
 * 测试用 NBT 写入器 + 采集端文件树夹具。
 *
 * 主模块只读；写入器只活在测试里，用来造 fixtures（本仓库的 run/ 目录没有真实采集文件）。
 */

const T = Object.freeze({
  END: 0,
  BYTE: 1,
  SHORT: 2,
  INT: 3,
  LONG: 4,
  FLOAT: 5,
  DOUBLE: 6,
  BYTE_ARRAY: 7,
  STRING: 8,
  LIST: 9,
  COMPOUND: 10,
  INT_ARRAY: 11,
  LONG_ARRAY: 12
})

function compound(entries = {}) {
  const list = Array.isArray(entries) ? entries : Object.entries(entries)
  return { type: T.COMPOUND, entries: list }
}

function list(itemType, items) {
  return { type: T.LIST, itemType, items }
}

const string = (value) => ({ type: T.STRING, value })
const int = (value) => ({ type: T.INT, value })
const long = (value) => ({ type: T.LONG, value })
const byte = (value) => ({ type: T.BYTE, value })
const float = (value) => ({ type: T.FLOAT, value })
const double = (value) => ({ type: T.DOUBLE, value })
const bool = (value) => ({ type: T.BYTE, value: value ? 1 : 0 })
const byteArray = (values) => ({ type: T.BYTE_ARRAY, value: values })
const intArray = (values) => ({ type: T.INT_ARRAY, value: values })
const longArray = (values) => ({ type: T.LONG_ARRAY, value: values })

function writeString(chunks, value) {
  const body = Buffer.from(value, 'utf8')
  const length = Buffer.alloc(2)
  length.writeUInt16BE(body.length)
  chunks.push(length, body)
}

function writePayload(chunks, tag) {
  switch (tag.type) {
    case T.BYTE: {
      const buf = Buffer.alloc(1)
      buf.writeInt8(tag.value)
      chunks.push(buf)
      return
    }
    case T.SHORT: {
      const buf = Buffer.alloc(2)
      buf.writeInt16BE(tag.value)
      chunks.push(buf)
      return
    }
    case T.INT: {
      const buf = Buffer.alloc(4)
      buf.writeInt32BE(tag.value)
      chunks.push(buf)
      return
    }
    case T.LONG: {
      const buf = Buffer.alloc(8)
      buf.writeBigInt64BE(BigInt(tag.value))
      chunks.push(buf)
      return
    }
    case T.FLOAT: {
      const buf = Buffer.alloc(4)
      buf.writeFloatBE(tag.value)
      chunks.push(buf)
      return
    }
    case T.DOUBLE: {
      const buf = Buffer.alloc(8)
      buf.writeDoubleBE(tag.value)
      chunks.push(buf)
      return
    }
    case T.BYTE_ARRAY: {
      const length = Buffer.alloc(4)
      length.writeInt32BE(tag.value.length)
      const body = Buffer.alloc(tag.value.length)
      tag.value.forEach((v, i) => body.writeInt8(v, i))
      chunks.push(length, body)
      return
    }
    case T.STRING:
      writeString(chunks, tag.value)
      return
    case T.LIST: {
      const head = Buffer.alloc(5)
      head.writeUInt8(tag.itemType, 0)
      head.writeInt32BE(tag.items.length, 1)
      chunks.push(head)
      for (const item of tag.items) writePayload(chunks, item)
      return
    }
    case T.COMPOUND: {
      for (const [name, child] of tag.entries) {
        chunks.push(Buffer.from([child.type]))
        writeString(chunks, name)
        writePayload(chunks, child)
      }
      chunks.push(Buffer.from([T.END]))
      return
    }
    case T.INT_ARRAY: {
      const length = Buffer.alloc(4)
      length.writeInt32BE(tag.value.length)
      const body = Buffer.alloc(tag.value.length * 4)
      tag.value.forEach((v, i) => body.writeInt32BE(v, i * 4))
      chunks.push(length, body)
      return
    }
    case T.LONG_ARRAY: {
      const length = Buffer.alloc(4)
      length.writeInt32BE(tag.value.length)
      const body = Buffer.alloc(tag.value.length * 8)
      tag.value.forEach((v, i) => body.writeBigInt64BE(BigInt(v), i * 8))
      chunks.push(length, body)
      return
    }
    default:
      throw new Error(`test nbt writer: unsupported tag ${tag.type}`)
  }
}

/** 编码一个完整的命名根 tag（默认名字为空，与 MC 一致）。 */
function encodeRoot(tag, name = '') {
  const chunks = [Buffer.from([tag.type])]
  writeString(chunks, name)
  writePayload(chunks, tag)
  return Buffer.concat(chunks)
}

/** 写 NBT 文件；默认 gzip（与 mod 的 NbtIo.writeCompressed 一致）。 */
function writeNbtFile(file, tag, options = {}) {
  const raw = encodeRoot(tag, options.name || '')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, options.raw ? raw : zlib.gzipSync(raw))
  return file
}

function makeTempDir(prefix = 'stevex-nbt-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function dimDirName(dim) {
  return dim.replaceAll(':', '_')
}

/** 区文件根（VisionRegions.regionRoot 的同形）。 */
function regionRoot(dim, regionX, regionZ, updatedAt, leafKey, leaf) {
  return compound({
    dimension: string(dim),
    regionX: int(regionX),
    regionZ: int(regionZ),
    updatedAt: long(updatedAt),
    [leafKey]: leaf
  })
}

/** 写一个区文件到 `<storeDir>/<dim dir>/r.<rx>.<rz>.nbt`。 */
function writeRegion(storeDir, dim, regionX, regionZ, leafKey, leaf, updatedAt) {
  const file = path.join(storeDir, dimDirName(dim), `r.${regionX}.${regionZ}.nbt`)
  writeNbtFile(file, regionRoot(dim, regionX, regionZ, updatedAt, leafKey, leaf))
  return file
}

/** 写 `_index.nbt`：{ dimensions: { dim: { "rx,rz": updatedAt } } }。 */
function writeIndex(storeDir, index) {
  const dims = {}
  for (const dim of Object.keys(index)) {
    const regions = {}
    for (const key of Object.keys(index[dim])) regions[key] = long(index[dim][key])
    dims[dim] = compound(regions)
  }
  return writeNbtFile(path.join(storeDir, '_index.nbt'), compound({ dimensions: compound(dims) }))
}

module.exports = {
  T,
  compound,
  list,
  string,
  int,
  long,
  byte,
  float,
  double,
  bool,
  byteArray,
  intArray,
  longArray,
  encodeRoot,
  writeNbtFile,
  makeTempDir,
  removeDir,
  dimDirName,
  regionRoot,
  writeRegion,
  writeIndex
}
