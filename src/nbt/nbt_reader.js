'use strict'

const zlib = require('node:zlib')

/**
 * NBT 二进制读取器（docs/nbt查询api设计方案.md §11 第 1 条"类型映射表"）。
 *
 * 映射口径：
 *   Byte / Short / Int / Float / Double → number
 *   Long                                → number（**杜绝 BigInt**，2026-10-17 定：本 API 触及的
 *                                         long 全是毫秒时间戳，远小于 2^53）
 *   String                              → string（Java modified UTF-8，见 readModifiedUtf8）
 *   List                                → Array
 *   Compound                            → 普通对象（键序保留；`__proto__` 用 defineProperty 防污染）
 *   Byte_Array                          → number[]（**有符号** byte）
 *   Int_Array / Long_Array              → number[]
 *
 * 压缩方式自动识别：gzip（1f 8b）/ zlib（CMF/FLG 校验）/ 裸 NBT（§5.1）。
 */
const TAG = Object.freeze({
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

/** 嵌套深度上限（§6.2：防深递归）。 */
const DEFAULT_MAX_DEPTH = 512
/** 解压后字节上限（§6.2：防 zip bomb）。真实区文件在 10MB 量级，这里留足余量。 */
const DEFAULT_MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024

class NbtReadError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'NbtReadError'
    this.code = code
    if (options.cause) this.cause = options.cause
  }
}

/** 解压（若需要）；不认识的前缀按裸 NBT 处理。 */
function decompress(buffer, maxDecompressedBytes) {
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return inflateBuffer(buffer, maxDecompressedBytes, 'gzip')
  }
  if (buffer.length >= 2) {
    const cmf = buffer[0]
    const flg = buffer[1]
    // zlib 头：CM=8（deflate）且 (CMF*256 + FLG) % 31 === 0
    if ((cmf & 0x0f) === 8 && ((cmf << 8) | flg) % 31 === 0) {
      return inflateBuffer(buffer, maxDecompressedBytes, 'zlib')
    }
  }
  return buffer
}

function inflateBuffer(buffer, maxDecompressedBytes, kind) {
  try {
    const inflate = kind === 'gzip' ? zlib.gunzipSync : zlib.inflateSync
    return inflate(buffer, { maxOutputLength: maxDecompressedBytes })
  } catch (e) {
    throw new NbtReadError('BAD_COMPRESSION', `${kind} decompress failed: ${e.message}`, { cause: e })
  }
}

/**
 * Java modified UTF-8 解码（§6.1：解析器与 mod 侧 NbtIo 的口径差异）。
 *
 * 与标准 UTF-8 的差别只有三点：
 *   1. U+0000 编码为 C0 80（不是 0x00）；
 *   2. 补充平面字符拆成两个 3 字节代理项（CESU-8），不出现 4 字节序列。
 * 逐单元解码成 UTF-16 code unit 即可——相邻代理项在 JS 字符串里自然还原成一个字符。
 */
function readModifiedUtf8(buffer, start, length) {
  const units = []
  const end = start + length
  let i = start
  while (i < end) {
    const b = buffer[i++]
    if (b < 0x80) {
      units.push(b)
      continue
    }
    if ((b & 0xe0) === 0xc0) {
      if (i >= end) throw new NbtReadError('BAD_STRING', 'truncated 2-byte sequence')
      const b2 = buffer[i++]
      if ((b2 & 0xc0) !== 0x80) throw new NbtReadError('BAD_STRING', 'invalid 2-byte sequence')
      units.push(((b & 0x1f) << 6) | (b2 & 0x3f))
      continue
    }
    if ((b & 0xf0) === 0xe0) {
      if (i + 1 >= end) throw new NbtReadError('BAD_STRING', 'truncated 3-byte sequence')
      const b2 = buffer[i++]
      const b3 = buffer[i++]
      if ((b2 & 0xc0) !== 0x80 || (b3 & 0xc0) !== 0x80) {
        throw new NbtReadError('BAD_STRING', 'invalid 3-byte sequence')
      }
      units.push(((b & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f))
      continue
    }
    // modified UTF-8 不出现 4 字节序列；出现即说明不是 Java 写出的 NBT
    throw new NbtReadError('BAD_STRING', `invalid lead byte 0x${b.toString(16)}`)
  }

  // 分块拼接，避免超长字符串打爆调用栈
  let out = ''
  for (let k = 0; k < units.length; k += 4096) {
    out += String.fromCharCode.apply(null, units.slice(k, k + 4096))
  }
  return out
}

class Reader {
  constructor(buffer, maxDepth) {
    this.buffer = buffer
    this.offset = 0
    this.depth = 0
    this.maxDepth = maxDepth
  }

  ensure(n) {
    if (n < 0 || this.offset + n > this.buffer.length) {
      throw new NbtReadError('TRUNCATED', `unexpected end of NBT at offset ${this.offset} (need ${n} bytes)`)
    }
  }

  u8() {
    this.ensure(1)
    return this.buffer[this.offset++]
  }

  i8() {
    this.ensure(1)
    const v = this.buffer.readInt8(this.offset)
    this.offset += 1
    return v
  }

  i16() {
    this.ensure(2)
    const v = this.buffer.readInt16BE(this.offset)
    this.offset += 2
    return v
  }

  u16() {
    this.ensure(2)
    const v = this.buffer.readUInt16BE(this.offset)
    this.offset += 2
    return v
  }

  i32() {
    this.ensure(4)
    const v = this.buffer.readInt32BE(this.offset)
    this.offset += 4
    return v
  }

  i64() {
    this.ensure(8)
    const v = Number(this.buffer.readBigInt64BE(this.offset))
    this.offset += 8
    return v
  }

  f32() {
    this.ensure(4)
    const v = this.buffer.readFloatBE(this.offset)
    this.offset += 4
    return v
  }

  f64() {
    this.ensure(8)
    const v = this.buffer.readDoubleBE(this.offset)
    this.offset += 8
    return v
  }

  string() {
    const length = this.u16()
    this.ensure(length)
    const value = readModifiedUtf8(this.buffer, this.offset, length)
    this.offset += length
    return value
  }

  enter() {
    this.depth += 1
    if (this.depth > this.maxDepth) {
      throw new NbtReadError('TOO_DEEP', `NBT nesting deeper than ${this.maxDepth}`)
    }
  }

  leave() {
    this.depth -= 1
  }

  payload(type) {
    switch (type) {
      case TAG.BYTE: return this.i8()
      case TAG.SHORT: return this.i16()
      case TAG.INT: return this.i32()
      case TAG.LONG: return this.i64()
      case TAG.FLOAT: return this.f32()
      case TAG.DOUBLE: return this.f64()
      case TAG.BYTE_ARRAY: {
        const length = this.i32()
        this.ensure(length)
        const out = new Array(length)
        for (let i = 0; i < length; i++) out[i] = this.buffer.readInt8(this.offset + i)
        this.offset += length
        return out
      }
      case TAG.STRING:
        return this.string()
      case TAG.LIST:
        return this.list()
      case TAG.COMPOUND:
        return this.compound()
      case TAG.INT_ARRAY: {
        const length = this.i32()
        this.ensure(length * 4)
        const out = new Array(length)
        for (let i = 0; i < length; i++) out[i] = this.buffer.readInt32BE(this.offset + i * 4)
        this.offset += length * 4
        return out
      }
      case TAG.LONG_ARRAY: {
        const length = this.i32()
        this.ensure(length * 8)
        const out = new Array(length)
        for (let i = 0; i < length; i++) out[i] = Number(this.buffer.readBigInt64BE(this.offset + i * 8))
        this.offset += length * 8
        return out
      }
      default:
        throw new NbtReadError('BAD_TAG', `unknown tag type ${type}`)
    }
  }

  list() {
    const itemType = this.u8()
    const length = this.i32()
    if (length < 0) throw new NbtReadError('BAD_LIST', `negative list length ${length}`)
    if (length > 0 && itemType === TAG.END) {
      throw new NbtReadError('BAD_LIST', 'non-empty list of TAG_End')
    }
    // 每个元素至少 1 字节（TAG_End）——先做一次粗糙的边界检查，防伪造长度撑爆内存
    this.ensure(length)
    this.enter()
    const out = new Array(length)
    for (let i = 0; i < length; i++) out[i] = this.payload(itemType)
    this.leave()
    return out
  }

  compound() {
    this.enter()
    const out = {}
    for (;;) {
      const type = this.u8()
      if (type === TAG.END) break
      const name = this.string()
      const value = this.payload(type)
      if (name === '__proto__') {
        Object.defineProperty(out, name, { value, enumerable: true, writable: true, configurable: true })
      } else {
        out[name] = value
      }
    }
    this.leave()
    return out
  }
}

/**
 * 解析一个 NBT 文件（自动识别 gzip / zlib / 裸）。
 *
 * @param {Buffer} buffer 文件内容
 * @param {object} [options] { maxDepth, maxDecompressedBytes }
 * @returns {{ name: string, value: any }}
 */
function parseNbt(buffer, options = {}) {
  const raw = decompress(buffer, options.maxDecompressedBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES)
  const reader = new Reader(raw, options.maxDepth ?? DEFAULT_MAX_DEPTH)
  const type = reader.u8()
  if (type === TAG.END) throw new NbtReadError('BAD_ROOT', 'root tag is TAG_End')
  const name = reader.string()
  return { name, value: reader.payload(type) }
}

module.exports = {
  TAG,
  NbtReadError,
  parseNbt,
  readModifiedUtf8,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_DECOMPRESSED_BYTES
}
