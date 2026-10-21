'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const zlib = require('node:zlib')

const { parseNbt, NbtReadError, TAG } = require('../../src/nbt/nbt_reader')
const NBT = require('./helpers')

test('读取全部基本类型（gzip）', () => {
  const root = NBT.compound({
    name: NBT.string('钻石'),
    count: NBT.int(42),
    stamp: NBT.long(1729999999999),
    speed: NBT.float(1.5),
    ratio: NBT.double(0.5),
    flag: NBT.bool(true), // NBT 没有 boolean：读出来是 byte 1；布尔归一化在数据源层（sources.js）
    signedByte: NBT.byte(-1),
    bytes: NBT.byteArray([-128, 0, 127]),
    ints: NBT.intArray([1, -2, 3]),
    longs: NBT.longArray([1, 2]),
    tags: NBT.list(TAG.STRING, [NBT.string('a'), NBT.string('b')]),
    nested: NBT.compound({ deep: NBT.int(7) })
  })

  const parsed = parseNbt(zlib.gzipSync(NBT.encodeRoot(root)))
  assert.equal(parsed.name, '')
  assert.deepEqual(parsed.value, {
    name: '钻石',
    count: 42,
    stamp: 1729999999999, // long → number（杜绝 BigInt）
    speed: 1.5,
    ratio: 0.5,
    flag: 1,
    signedByte: -1,
    bytes: [-128, 0, 127],
    ints: [1, -2, 3],
    longs: [1, 2],
    tags: ['a', 'b'],
    nested: { deep: 7 }
  })
})

test('自动识别 gzip / zlib / 裸 NBT', () => {
  const root = NBT.compound({ v: NBT.int(9) })
  const raw = NBT.encodeRoot(root)

  assert.equal(parseNbt(raw).value.v, 9)
  assert.equal(parseNbt(zlib.gzipSync(raw)).value.v, 9)
  assert.equal(parseNbt(zlib.deflateSync(raw)).value.v, 9)
})

test('modified UTF-8：C0 80（NUL）与 CESU-8 代理对', () => {
  // 手写：compound{ s: "😀"(D83D DE00 → 6 字节), t: "a\0"(61 C0 80) }
  const raw = Buffer.from([
    0x0a, 0x00, 0x00,
    0x08, 0x00, 0x01, 0x73, 0x00, 0x06, 0xed, 0xa0, 0xbd, 0xed, 0xb8, 0x80,
    0x08, 0x00, 0x01, 0x74, 0x00, 0x03, 0x61, 0xc0, 0x80,
    0x00
  ])

  const parsed = parseNbt(raw)
  assert.equal(parsed.value.s, '😀')
  assert.equal(parsed.value.s, '😀')
  assert.equal(parsed.value.t, 'a\u0000')
})

test('截断文件 → TRUNCATED', () => {
  const root = NBT.compound({ a: NBT.string('hello'), b: NBT.int(1) })
  const raw = NBT.encodeRoot(root)

  assert.throws(
    () => parseNbt(raw.subarray(0, raw.length - 3)),
    (e) => e instanceof NbtReadError && e.code === 'TRUNCATED'
  )
})

test('损坏的 gzip → BAD_COMPRESSION', () => {
  const bad = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00])
  assert.throws(
    () => parseNbt(bad),
    (e) => e instanceof NbtReadError && e.code === 'BAD_COMPRESSION'
  )
})

test('嵌套过深 → TOO_DEEP', () => {
  let tag = NBT.compound({ leaf: NBT.int(1) })
  for (let i = 0; i < 600; i++) tag = NBT.compound({ n: tag })

  assert.throws(
    () => parseNbt(NBT.encodeRoot(tag)),
    (e) => e instanceof NbtReadError && e.code === 'TOO_DEEP'
  )
})
