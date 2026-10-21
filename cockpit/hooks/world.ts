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
  registered: string[]
  copied: string[]
  fillModes: string[]
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; model: string }
}

export type WorldOptions = {
  isPlaced?: boolean
  stored?: Record<string, unknown>
  messages?: { role: string; text: string }[]
  brief?: string
  clock?: ReturnType<typeof mock.clock>
  env?: Record<string, string> // environment variables the "host" has (default: HOME only)
  refuse?: string[] // command names the "app" refuses to register
  stepChunks?: unknown[] // what the stub model streams before it answers (a tool call beginning, pieces of its arguments)
  contextTokens?: number // what $.session.usage reports (default 200k, above the saver's limit)
  bare?: boolean // leave the git, file, skill and sound calls to the test
}

export function world(on: On, o: WorldOptions = {}): Log & { clock: ReturnType<typeof mock.clock> } {
  const isPlaced = o.isPlaced ?? true
  const stored = o.stored ?? {}
  const log: Log = { open: [], closed: [], writes: {}, toasts: [], notices: [], commands: [], fills: [], files: [], asked: [], box: { text: '' }, registered: [], copied: [], fillModes: [], usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 190_000, model: 'claude-sonnet-5-5' } }
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
  on('ui.panes', () => ({ value: log.open.length > log.closed.length && isPlaced ? [{ id: 'cockpit', title: 'Cockpit', isPlaced: true }] : [] }) as never)
  on('ui.toast', (_, e) => {
    log.toasts.push(String((e as { text?: string }).text))
    return { value: undefined } as never
  })
  on('ui.notify', (_, e) => {
    log.notices.push(String((e as { text?: string }).text))
    return { value: { isSent: true, channel: 'test' } } as never
  })
  on('ui.status', () => ({ value: undefined }) as never)
  const env = o.env ?? { HOME: '/home/test' }
  on('env.get', (_, e) => ({ value: env[(e as { name: string }).name] }) as never)
  on('ui.copy', (_, e) => {
    log.copied.push(String((e as { text?: string }).text))
    return { value: { isCopied: true } } as never
  })
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
    log.fillModes.push(String(e.mode))
    log.box.text = e.text
    return { isFilled: true }
  })
  on('prompt.read', () => ({ value: { text: log.box.text, cursor: log.box.text.length } }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: o.contextTokens ?? 200_000, window: 1_000_000, percent: 20 }, rateLimits: [] } }) as never)
  on('command.register', (_, e) => {
    const name = String((e as { name?: string }).name)
    if (o.refuse?.includes(name)) return { deny: `/${name} is already a command` } as never
    log.registered.push(name)
    return { value: { command: name } } as never
  })
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  // The other features: not a git folder, no skills, no files, so they stay quiet unless a test says otherwise.
  if (!o.bare) {
    on('session.cwd', () => ({ value: '/r' }) as never)
    on('session.id', () => ({ value: 'sess1' }) as never)
    on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false } }) as never)
    on('fs.list', () => ({ value: [] }) as never)
    on('fs.exists', () => ({ value: false }) as never)
    on('fs.read', () => ({ value: '' }) as never)
    on('command.list', () => ({ value: [] }) as never)
    on('audio.play', () => ({ value: undefined }) as never)
  }
  // The request the stub "model" answers: tests change log.usage to say what the cache did.
  on('turn.step', async function* () {
    for (const chunk of o.stepChunks ?? []) yield chunk as never
    return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: log.usage } as never
  } as never)
  on('turn.start', (_, e) => e as never)
  return Object.assign(log, { clock })
}
