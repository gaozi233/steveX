const test = require('node:test')
const assert = require('node:assert/strict')
const { assessOutcome } = require('../scripts/task-crafting-live')
const scenario = { targets: { chest: 1, hopper: 1 }, inputs: {} }
const slots = [{ name: 'chest', count: 1 }, { name: 'hopper', count: 1 }]

test('task crafting scoring distinguishes achieved inventory from a completion declaration', () => {
  const result = assessOutcome(scenario, slots, { chest: 1, hopper: 1 })
  assert.equal(result.targetsPassed, true)
  assert.equal(result.declarationPassed, false)
  assert.equal(result.passed, false)
  assert.equal(assessOutcome(scenario, slots, { chest: 1, hopper: 1 }, 'DONE').passed, true)
})

test('completion cannot hide missing targets, incorrect server counts or excess output', () => {
  assert.equal(assessOutcome(scenario, slots.slice(0, 1), { chest: 1, hopper: 0 }, 'DONE').passed, false)
  assert.equal(assessOutcome(scenario, slots, { chest: 1, hopper: 0 }, 'DONE').passed, false)
  assert.equal(assessOutcome(scenario, [...slots, { name: 'chest', count: 1 }], { chest: 2, hopper: 1 }, 'DONE').passed, false)
})

test('blocked requires a BLOCKED declaration and preserved materials on client and server', () => {
  const blocked = { targets: { anvil: 1 }, inputs: { iron_block: 3 }, expectedBlocked: true }
  const inventory = [{ name: 'iron_block', count: 3 }]
  assert.equal(assessOutcome(blocked, inventory, { anvil: 0, iron_block: 3 }, 'BLOCKED').passed, true)
  assert.equal(assessOutcome(blocked, inventory, { anvil: 0, iron_block: 2 }, 'BLOCKED').passed, false)
  assert.equal(assessOutcome(blocked, inventory, { anvil: 0, iron_block: 3 }, 'DONE').passed, false)
})

test('alternative recipe selection must also preserve requested source materials', () => {
  const alternatives = { target: 'iron_ingot', count: 1, inputs: {}, preserve: { iron_block: 1 } }
  const inventory = [{ name: 'iron_ingot', count: 1 }, { name: 'iron_block', count: 1 }]
  assert.equal(assessOutcome(alternatives, inventory, { iron_ingot: 1, iron_block: 1 }, 'DONE').passed, true)
  assert.equal(assessOutcome(alternatives, inventory, { iron_ingot: 1, iron_block: 0 }, 'DONE').passed, false)
})
