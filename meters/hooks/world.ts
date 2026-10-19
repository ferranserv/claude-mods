// Test scaffolding: everything beneath the plugin (clock, store, panes, prompt box, models), with a log of what it was asked.
import type { On } from 'claude-code'
import { mock } from 'claude-code/testing'

export const WED = new Date(2026, 9, 21, 12).getTime()
export const MIN = 60_000

export type Log = {
  open: string[]
  closed: string[]
  writes: Record<string, unknown>
  toasts: string[]
  notices: string[]
  commands: string[]
  fills: string[]
  files: { path: string; text: string }[]
  asked: { kind: 'fork' | 'complete'; prompt: string; model?: string }[]
  box: { text: string }
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; model: string }
}

export type WorldOptions = {
  isPlaced?: boolean
  stored?: Record<string, unknown>
  messages?: { role: string; text: string }[]
  brief?: string
  clock?: ReturnType<typeof mock.clock>
}

export function world(on: On, o: WorldOptions = {}): Log & { clock: ReturnType<typeof mock.clock> } {
  const isPlaced = o.isPlaced ?? true
  const stored = o.stored ?? {}
  const log: Log = { open: [], closed: [], writes: {}, toasts: [], notices: [], commands: [], fills: [], files: [], asked: [], box: { text: '' }, usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 190_000, model: 'claude-sonnet-5-5' } }
  const clock = o.clock ?? mock.clock(on, { now: WED })

  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  on('store.get', (_, e) => ({ value: e.key in log.writes ? log.writes[e.key] : stored[e.key] }) as never)
  on('store.set', (_, e) => {
    log.writes[e.key] = e.value
    return { value: undefined } as never
  })
  on('store.delete', (_, e) => {
    log.writes[e.key] = undefined
    return { value: undefined } as never
  })
  on('ui.open', (_, e) => {
    log.open.push(e.id)
    return { value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'too narrow' } } as never
  })
  on('ui.close', (_, e) => {
    log.closed.push(e.id)
    return { value: {} } as never
  })
  on('ui.panes', () => ({ value: log.open.length > log.closed.length && isPlaced ? [{ id: 'meters', title: 'Usage', isPlaced: true }] : [] }) as never)
  on('ui.toast', (_, e) => {
    log.toasts.push(String((e as { text?: string }).text))
    return { value: undefined } as never
  })
  on('ui.notify', (_, e) => {
    log.notices.push(String((e as { text?: string }).text))
    return { value: { isSent: true, channel: 'test' } } as never
  })
  on('ui.status', () => ({ value: undefined }) as never)
  on('env.get', () => ({ value: '/home/test' }) as never)
  on('fs.write', (_, e) => {
    log.files.push({ path: (e as { path: string }).path, text: (e as { text: string }).text })
    return { value: undefined } as never
  })
  on('session.messages', () => ({ value: o.messages ?? [{ role: 'user', text: 'build the importer' }, { role: 'assistant', text: 'done, tests pass' }] }) as never)
  on('model.fork', (_, e) => {
    log.asked.push({ kind: 'fork', prompt: String((e as { prompt: string }).prompt) })
    return { value: { isAnswered: true, text: o.brief ?? 'FORK BRIEF', usage: {} } } as never
  })
  on('model.complete', (_, e) => {
    log.asked.push({ kind: 'complete', prompt: String((e as { prompt: string }).prompt), model: (e as { model: string }).model })
    return { value: { isAnswered: true, text: o.brief ?? 'COMPLETE BRIEF', usage: {} } } as never
  })
  on('command.run', (_, e) => {
    log.commands.push(e.command)
    return { text: '' } as never
  })
  on('prompt.fill', (_, e) => {
    log.fills.push(e.text)
    log.box.text = e.text
    return { isFilled: true }
  })
  on('prompt.read', () => ({ value: { text: log.box.text, cursor: log.box.text.length } }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 200_000, window: 1_000_000, percent: 20 }, rateLimits: [] } }) as never)
  on('command.register', () => ({ value: { command: 'x' } }) as never)
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  // The request the stub "model" answers: tests change log.usage to say what the cache did.
  on('turn.step', async function* () {
    return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: log.usage } as never
  } as never)
  on('turn.start', (_, e) => e as never)
  return Object.assign(log, { clock })
}
