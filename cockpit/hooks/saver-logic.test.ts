import { describe, expect, test } from 'claude-code/testing'

import { costOf, dayKey, isStripShown, labelLocally, parseMode, savingOf, shortName } from './saver-logic'
import { money, priceOf } from './lib'

describe('labelLocally', () => {
  test('easy work stays easy', () => {
    expect(labelLocally('fix the typo in the README heading')).toBe('easy')
    expect(labelLocally('rename foo to bar in utils.ts')).toBe('easy')
    expect(labelLocally('give me a short summary of this file')).toBe('easy')
  })

  test('many-step or building work is hard', () => {
    expect(labelLocally('debug why the login test is failing')).toBe('hard')
    expect(labelLocally('implement a retry wrapper around the fetch call')).toBe('hard')
    expect(labelLocally('1. add x\n2. add y\n3. add z')).toBe('hard')
    expect(labelLocally('x'.repeat(900))).toBe('hard')
  })

  test('mixed words are left for the model to label', () => {
    expect(labelLocally('what is the bug in this function, briefly?')).toBe('unclear')
  })

  test('a short follow-up keeps the current model', () => {
    expect(labelLocally('yes, go ahead')).toBe('hard')
  })
})

describe('prices', () => {
  test('list prices by model id or alias', () => {
    expect(priceOf('claude-sonnet-5-5')).toEqual({ input: 2, output: 10 })
    expect(priceOf('claude-opus-5-5')).toEqual({ input: 4, output: 20 })
    expect(priceOf('claude-opus-5')).toEqual({ input: 5, output: 25 })
    expect(priceOf('claude-opus-4-8')).toEqual({ input: 5, output: 25 })
    expect(priceOf('claude-fable-5-1')).toEqual({ input: 10, output: 50 })
    expect(priceOf('claude-sonnet-4-6')).toEqual({ input: 3, output: 15 })
    expect(priceOf('claude-haiku-5-5')).toEqual({ input: 0.1, output: 0.5 })
    expect(priceOf('opus[1m]')).toEqual({ input: 4, output: 20 })
    expect(priceOf('gpt-x')).toBeNull()
  })

  test('saving is main cost minus Haiku cost, cached tokens counted as input', () => {
    const u = {
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    }
    // Sonnet 5.5: 2.00 + 1.00 = 3.00; Haiku 5.5: 0.10 + 0.05 = 0.15
    expect(Math.round(costOf({ input: 2, output: 10 }, u) * 1e6)).toBe(3_000_000)
    expect(Math.round(savingOf({ input: 2, output: 10 }, u) * 1e6)).toBe(2_850_000)
    const cached = { ...u, input_tokens: 0, cache_read_input_tokens: 1_000_000 }
    expect(Math.round(costOf({ input: 2, output: 10 }, cached) * 1e6)).toBe(3_000_000)
  })
})

describe('display', () => {
  test('names, money, day', () => {
    expect(shortName('claude-haiku-5-5')).toBe('haiku 5.5')
    expect(shortName('claude-opus-5')).toBe('opus 5')
    expect(money(0.00123)).toBe('$0.0012')
    expect(money(1.234)).toBe('$1.23')
    expect(dayKey(new Date(2026, 9, 19, 12).getTime())).toBe('2026-10-19')
  })
})

describe('strip', () => {
  test('active needs saver on AND the last answer routed; on needs saver on; always is always', () => {
    expect(isStripShown('active', true, true)).toBe(true)
    expect(isStripShown('active', true, false)).toBe(false)
    expect(isStripShown('active', false, true)).toBe(false)
    expect(isStripShown('on', true, false)).toBe(true)
    expect(isStripShown('on', false, true)).toBe(false)
    expect(isStripShown('always', false, false)).toBe(true)
  })
  test('modes parse', () => {
    expect(parseMode('on')).toBe('on')
    expect(parseMode('nope')).toBeNull()
    expect(parseMode(undefined)).toBeNull()
  })
})
