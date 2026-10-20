import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 80, scroll: { bodyRows: 6 }, view: {} },
}

test('Enhance rewrites the draft in place, then Undo restores it', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  let box = 'fix login bug'
  let seen = ''
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.fill', (_$, e) => {
    box = e.text
    return { isFilled: true }
  })
  on('command.list', () => ({ value: [{ name: 'debug', description: 'Structured debugging of a failing login', source: 'plugin' }] }) as never)
  on('model.complete', (_$, e) => {
    seen = String(e.prompt)
    return { value: { isAnswered: true, text: 'Fix the login bug.\n\nUse these skills:\n- /debug\n\nDone looks like:\n- login works', usage: {} } } as never
  })

  await $.command.run({ command: 'enhance', args: 'fix login bug' } as never)

  expect(box).toContain('Use these skills:')
  expect(seen).toContain('<draft>\nfix login bug\n</draft>')
  expect(seen).toContain('/debug')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'prompt-enhancer', surface, ...BAND } as never)
    expect(await ui.find({ key: 'enhance' })).toBeDefined()
    await ui.press({ key: 'undo' })
    expect(box).toBe('fix login bug')
    await ui.unmount()
    box = 'Fix the login bug.\n\nUse these skills:' // restore the enhanced state for the next surface
    await $.command.run({ command: 'enhance', args: 'fix login bug' } as never)
  }
})

test('a failed model call leaves the draft alone', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  let box = 'keep me'
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.fill', (_$, e) => {
    box = e.text
    return { isFilled: true }
  })
  on('command.list', () => ({ value: [] }) as never)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: {} } }) as never)

  const r = await $.command.run({ command: 'enhance', args: 'keep me' } as never)
  expect(box).toBe('keep me')
  expect(String((r as { text: string }).text)).toContain('failed')
})

test('hotkey consumes the key; other keys pass through', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  let fills = 0
  on('prompt.read', () => ({ value: { text: 'draft', cursor: 5 } }))
  on('prompt.fill', () => {
    fills += 1
    return { isFilled: true }
  })
  on('command.list', () => ({ value: [] }) as never)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'enhanced', usage: {} } }) as never)
  on('prompt.edit', (_$, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))

  const edit = ($$: unknown, input: unknown) => ($$ as { prompt: { edit: (i: unknown) => Promise<unknown> } }).prompt.edit(input)
  const base = { origin: { kind: 'composer' }, text: 'draft', cursor: 5, start: 5, end: 5 }
  const plain = await edit($, { ...base, key: { key: 'x' }, inputText: 'x' } as never)
  expect((plain as { text: string }).text).toBe('draftx')
  await clock.advance(1)
  expect(fills).toBe(0)
  const hot = await edit($, { ...base, key: { key: 'e', meta: true }, inputText: '' } as never)
  expect((hot as { text: string }).text).toBe('draft')
  expect(fills).toBe(0)
  await clock.advance(1)
  await clock.settle()
  expect(fills).toBe(1)
})
