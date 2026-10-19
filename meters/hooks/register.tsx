import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Cache } from '../types'
import { RANK, bandKey, stack } from './bands'
import { BRIEF_PROMPT, briefPath, coldPrompt, transcriptTail } from './handoff'
import { matchesChord, parseChord } from './keys'
import {
  CACHE_INITIAL,
  DEFAULT_LIMITS,
  altText,
  bandSvg,
  bandWidth,
  cacheView,
  clockText,
  learnWindow,
  line,
  model,
  money,
  priceOf,
  sideSvg,
  sideWidth,
  windowMinutes,
} from './lib'
import type { Thresholds } from './lib'

const PANE = 'meters'

const fillRef = { plugin: 'meters', key: 'fill' } as const
const limitsRef = { plugin: 'meters', key: 'limits' } as const
const isSideRef = { plugin: 'meters', key: 'isSide' } as const
const tickRef = { plugin: 'meters', key: 'tick' } as const
const cacheRef = { plugin: 'meters', key: 'cache' } as const
const modelIdRef = { plugin: 'meters', key: 'modelId' } as const
const isBusyRef = { plugin: 'meters', key: 'isBusy' } as const

const fill = atom(fillRef, null)
const limits = atom(limitsRef, [])
const isSide = atom(isSideRef, false)
// Bumped when the side panel opens or closes, so the band above the prompt redraws.
const tick = atom(tickRef, 0)
const cache = atom(cacheRef, CACHE_INITIAL as Cache)
const modelId = atom(modelIdRef, '')
const isBusy = atom(isBusyRef, false)

// The countdown text last drawn: the band is redrawn only when it changes.
let lastLabel = ''
let isHandoffRunning = false

function patchCache($: EngineInterface, fn: (c: Cache) => Cache) {
  return update($, cache, fn)
}

/** Every 15 seconds: redraws the band when the countdown text changed, sends the going-cold notice. */
async function pulse($: EngineInterface, notifyMin: number, stepMin: number) {
  const c = (await $.state.get(cacheRef)).value ?? CACHE_INITIAL
  if (c.lastAt <= 0) return
  const now = await $.clock.now()
  const tokens = (await $.state.get(fillRef)).value?.tokens ?? 0
  const price = priceOf((await $.state.get(modelIdRef)).value ?? '')
  const v = cacheView(c, now, tokens, price, notifyMin, stepMin)
  if (v.label !== lastLabel) {
    lastLabel = v.label
    $.ui.invalidate('ui.render')
  }

  if (v.state === 'soon' && c.notifiedAt !== c.lastAt) {
    await patchCache($, s => ({ ...s, notifiedAt: s.lastAt }))
    const mins = Math.max(1, Math.round(v.leftMs / 60_000))
    const cost = v.warmUsd !== null && v.coldUsd !== null ? ` Next message: ${money(v.warmUsd)} warm, ${money(v.coldUsd)} after.` : ''
    const text = `Prompt cache goes cold in ~${mins} min.${cost}`
    $.ui.toast(text)
    try {
      await $.ui.notify(text, { title: 'Meters' })
    } catch {
      // No terminal to notify (desktop host): the toast above is all there is.
    }
  }
}

/** Writes a handoff brief, clears the session, pastes the brief into the fresh one. */
async function handoff($: EngineInterface, pasteOnly: boolean) {
  if (isHandoffRunning) return
  isHandoffRunning = true
  try {
    if (await read($, isBusy)) {
      $.ui.toast('Claude is working. Handoff waits for the turn to end.')
      return
    }

    let brief = pasteOnly ? (((await $.store.get('lastBrief')) as string | undefined) ?? '') : ''
    if (!pasteOnly) {
      $.ui.status('writing handoff…')
      const c = await read($, cache)
      const now = await $.clock.now()
      // Warm cache: the fork reads the whole transcript from the cache, nearly free. Cold: re-caching it
      // would cost full price, so a small model reads the tail of the transcript instead.
      if (cacheView(c, now, 0, null).state !== 'cold' && c.lastAt > 0) {
        const forked = await $.model.fork({ prompt: BRIEF_PROMPT })
        if (forked.isAnswered) brief = forked.text.trim()
      }
      if (brief === '') {
        const rows = await $.session.messages()
        const tail = Array.isArray(rows) ? transcriptTail(rows, 60_000) : ''
        if (tail === '') {
          $.ui.toast('Nothing to hand off yet.')
          return
        }
        const r = await $.model.complete({ model: 'haiku', prompt: coldPrompt(tail), maxTokens: 1200, effort: 'low', timeoutMs: 60_000 })
        if (r.isAnswered) brief = r.text.trim()
      }
      if (brief === '') {
        $.ui.toast('Could not write the handoff brief. The session is untouched.')
        return
      }
      await $.store.set('lastBrief', brief)
      try {
        const home = (await $.env.get('HOME')) ?? ''
        if (home !== '') await $.fs.write(briefPath(home, now), brief + '\n')
      } catch {
        // The copy on disk is a safety net; the paste below is the point.
      }
    }
    if (brief === '') {
      $.ui.toast('No handoff brief saved yet.')
      return
    }

    // Re-pasting goes into the session you are already in: clearing again would throw that away.
    if (!pasteOnly) await $.command.run({ command: 'clear' })
    // The clear can land after the call returns: paste, wait, and check the box still holds the brief.
    let isPasted = false
    for (let attempt = 0; attempt < 3 && !isPasted; attempt++) {
      await $.clock.sleep(500)
      await $.prompt.fill({ text: brief, mode: 'replace' })
      isPasted = (await $.prompt.read()).text === brief
    }
    $.ui.toast(isPasted ? 'Handoff brief is in the prompt box: review, then Enter.' : 'The brief could not be pasted. /handoff paste retries; it is saved in ~/.claude/handoffs/.')
  } catch {
    $.ui.toast('Handoff failed. Nothing was cleared unless the session looks new.')
  } finally {
    isHandoffRunning = false
    $.ui.status(undefined)
  }
}

async function fresh($: EngineInterface) {
  if (await read($, isBusy)) {
    $.ui.toast('Claude is working. Wait for the turn to end.')
    return
  }
  await $.command.run({ command: 'clear' })
}

const thresholds = (o: Record<string, unknown>): Thresholds => {
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d)
  const warn = n(o.warnPercent, DEFAULT_LIMITS.warnPercent)
  return { warnPercent: warn, redPercent: Math.max(warn, n(o.redPercent, DEFAULT_LIMITS.redPercent)), warnTokens: n(o.warnTokens, DEFAULT_LIMITS.warnTokens) }
}

export const register: Register = (on, options) => {
  const limitsAt = thresholds(options)
  const fallbackMin = Math.max(1, Number(options.cacheMinutes ?? 60) || 60)
  const notifyMin = Math.max(1, Number(options.notifyMinutes ?? 5) || 5)
  const stepMin = Math.max(1, Number(options.cacheStepMinutes ?? 5) || 5)
  const handoffChord = parseChord(typeof options.handoffKey === 'string' ? options.handoffKey : 'meta+h')
  const freshChord = parseChord(typeof options.freshKey === 'string' ? options.freshKey : 'meta+n')
  const handoffLabel = typeof options.handoffKey === 'string' ? options.handoffKey : 'meta+h'
  const freshLabel = typeof options.freshKey === 'string' ? options.freshKey : 'meta+n'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'meters',
      description: 'Where the usage meters show: /meters side or /meters top',
      argumentHint: 'side|top',
    })
    await $.command.register({
      name: 'handoff',
      description: 'Write a handoff brief, clear the session, paste the brief into the fresh one (/handoff paste re-pastes the last)',
      argumentHint: 'paste',
    })
    await $.command.register({ name: 'fresh', description: 'Clear the session and start fresh, no handoff' })
    await $.command.register({
      name: 'cache',
      description: 'Prompt cache window: /cache shows it, /cache <minutes> sets it, /cache auto learns it',
      argumentHint: '<minutes>|auto',
    })

    const usage = await $.session.usage()
    await update($, limits, () => usage.rateLimits)
    const { tokens, window, percent } = usage.context
    if (tokens !== undefined && percent !== undefined) {
      await update($, fill, () => ({ tokens, window, percent }))
    }

    const override = await $.store.get('cacheOverride')
    const detected = await $.store.get('cacheDetected')
    await patchCache($, c => ({
      ...c,
      fallback: fallbackMin,
      override: typeof override === 'number' ? override : null,
      detected: detected === 5 || detected === 60 ? detected : c.detected,
    }))

    if ((await $.store.get('isSide')) === true) {
      await update($, isSide, () => true)
      void $.ui.open({ id: PANE, title: 'Usage' })
    }

    $.clock.every(15_000, () => void pulse($, notifyMin, stepMin))
    return next(e)
  })

  // The engine pushes every change of the window's fill and of the account's limits.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      const { tokens, window, percent } = e.context
      const value =
        tokens === undefined || percent === undefined ? null : { tokens, window, percent }
      await update($, fill, () => value)
    }
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => e.rateLimits)
    }

    return next(e)
  })

  // A /clear starts the context over: the old prefix is not what the next request re-reads.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await patchCache($, c => ({ ...c, lastAt: 0, lastEndAt: 0, notifiedAt: 0 }))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isBusy, () => true)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isBusy, () => false)
    return next(e)
  })

  // Sending a message is what restarts the countdown: the next request re-reads (or re-writes) the whole
  // prefix and the window starts over. Commands and hidden prompts send nothing.
  on('prompt.submit', async ($, e, next) => {
    if (!e.command && !e.isMeta) {
      const now = await $.clock.now()
      await patchCache($, c => ({ ...c, lastAt: now }))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Every main-loop request touches the prompt cache. The API does not report its TTL, so the window is
  // learned from what the first request after an idle gap read from the cache.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)

    const before = await read($, cache)
    const startedAt = await $.clock.now()
    // The request is going out: whatever was cached is read now, which restarts the whole window.
    await patchCache($, c => ({ ...c, lastAt: startedAt }))
    const response = yield* next(e)
    const endedAt = await $.clock.now()

    if (e.model !== (await read($, modelId))) await update($, modelId, () => e.model)
    const u = response.usage
    if (u) {
      // The idle gap is measured from the end of the previous request, not from its start.
      const gap = before.lastEndAt > 0 ? startedAt - before.lastEndAt : 0
      await patchCache($, c => ({
        ...(gap > 0 ? learnWindow(c, gap, { input: u.input_tokens, read: u.cache_read_input_tokens, create: u.cache_creation_input_tokens }) : c),
        lastEndAt: endedAt,
      }))
      if (gap > 0) {
        const learned = (await read($, cache)).detected
        if (learned !== null) await $.store.set('cacheDetected', learned)
      }
    }
    return response
  })

  // The engine itself says which TTL the session's cache has whenever the model is switched.
  on('classic.PreModelSwitch', async ($, e, next) => {
    const ttl = e.cache_ttl === '1h' ? 60 : e.cache_ttl === '5m' ? 5 : null
    if (ttl !== null) {
      await patchCache($, c => ({ ...c, detected: ttl, misses: 0 }))
      await $.store.set('cacheDetected', ttl)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.edit', async ($, e, next) => {
    if (matchesChord(handoffChord, e.key)) {
      $.clock.after(0, () => void handoff($, false))
      return { text: e.text, cursor: e.cursor }
    }
    if (matchesChord(freshChord, e.key)) {
      $.clock.after(0, () => void fresh($))
      return { text: e.text, cursor: e.cursor }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'meters' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'side') {
      await $.store.set('isSide', true)
      await update($, isSide, () => true)
      const opened = await $.ui.open({ id: PANE, title: 'Usage' })
      await update($, tick, n => n + 1)
      return {
        text: opened.isPlaced
          ? 'Meters moved to a side panel. Use /meters top to bring the band back.'
          : `The side panel is not drawn here (${opened.reason}); the band above the prompt stays.`,
      }
    }

    if (arg === 'top') {
      await $.store.set('isSide', false)
      await update($, isSide, () => false)
      await $.ui.close({ id: PANE })
      await update($, tick, n => n + 1)
      return { text: 'Meters back in the band above the prompt.' }
    }

    return { text: 'Use /meters side or /meters top.' }
  })

  on('command.run', { command: 'handoff' }, async ($, e) => {
    const isPaste = e.args.trim().toLowerCase() === 'paste'
    // The clear must not run inside this command's own dispatch.
    $.clock.after(0, () => void handoff($, isPaste))
    return { text: isPaste ? 'Pasting the last handoff brief into the prompt box…' : 'Writing a handoff brief, then starting a fresh session…' }
  })

  on('command.run', { command: 'fresh' }, async $ => {
    $.clock.after(0, () => void fresh($))
    return { text: 'Starting a fresh session…' }
  })

  on('command.run', { command: 'cache' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'auto') {
      await $.store.delete('cacheOverride')
      await patchCache($, c => ({ ...c, override: null }))
    } else if (arg !== '') {
      const minutes = Number(arg.replace(/m(in)?$/, ''))
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) return { text: 'Use /cache <minutes> (1 to 1440), or /cache auto.' }
      await $.store.set('cacheOverride', Math.round(minutes))
      await patchCache($, c => ({ ...c, override: Math.round(minutes) }))
    }
    const c = await read($, cache)
    const now = await $.clock.now()
    const tokens = (await read($, fill))?.tokens ?? 0
    const v = cacheView(c, now, tokens, priceOf(await read($, modelId)), notifyMin, stepMin)
    const source = c.override !== null ? 'set by you' : c.detected !== null ? 'learned from the API' : `default, not learned yet (${c.misses} miss${c.misses === 1 ? '' : 'es'} seen)`
    const left = v.state === 'unknown' ? 'no reply yet' : v.state === 'cold' ? 'cold' : `${clockText(v.leftMs)} left`
    const cost = v.warmUsd !== null && v.coldUsd !== null ? ` Next message input: ${money(v.warmUsd)} warm, ${money(v.coldUsd)} cold.` : ''
    return { text: `Prompt cache window ${windowMinutes(c)} min (${source}); ${left}.${cost}` }
  })

  // The person closed the side panel with its own close mark: remember it, or the next session reopens it.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') {
      await $.store.set('isSide', false)
      await update($, isSide, () => false)
      await update($, tick, n => n + 1)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below

    await read($, tick)
    if (await read($, isSide)) {
      try {
        const panes = await $.ui.panes()
        if (panes.some(p => p.id === PANE && p.isPlaced)) return below
      } catch {
        // No way to tell: draw the band.
      }
    }

    const now = await $.clock.now()
    const m = model({
      fill: await read($, fill),
      limits: await read($, limits),
      now,
      cache: { state: await read($, cache), price: priceOf(await read($, modelId)), soonMin: notifyMin, stepMin },
      limitsAt,
    })
    const { Box, Button } = $.ui.resolve(e)
    const actions = actionRow(m.ctx.level !== 'calm' && !e.props.isWorking, Box, Button, handoffLabel, freshLabel, () => handoff($, false), () => fresh($))

    let body
    if (e.surface === 'terminal') {
      const { Text } = $.ui.resolve(e)
      body = (
        <Box justifyContent="center">
          {line(m).map(s => (
            <Text color={s.fill}>{s.t}</Text>
          ))}
        </Box>
      )
    } else {
      const { Svg } = $.ui.resolve(e)
      const svg = bandSvg(bandWidth(e.props.bodyColumns), m)
      body = (
        <Box justifyContent="center">
          <Svg source={svg.source} alt={altText(m)} />
        </Box>
      )
    }

    const mine = (
      <Box key={bandKey('meters')} flexDirection="column">
        {body}
        {actions}
      </Box>
    )
    return stack(below, mine as never, Box)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const now = await $.clock.now()
    const m = model({
      fill: await read($, fill),
      limits: await read($, limits),
      now,
      cache: { state: await read($, cache), price: priceOf(await read($, modelId)), soonMin: notifyMin, stepMin },
      limitsAt,
    })
    const { Box, Button } = $.ui.resolve(e)
    const actions = actionRow(m.ctx.level !== 'calm', Box, Button, handoffLabel, freshLabel, () => handoff($, false), () => fresh($))

    if (e.surface === 'terminal') {
      const { Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          {line(m, 6).map(s => (
            <Text color={s.fill}>{s.t}</Text>
          ))}
          {actions}
        </Box>
      )
    }

    // A docked pane is a column beside the transcript; an inline one sits above the prompt like the band.
    const { Svg } = $.ui.resolve(e)
    const svg = e.props.placement === 'dock' ? sideSvg(sideWidth(e.props.bodyColumns), m) : bandSvg(bandWidth(e.props.bodyColumns), m)
    return (
      <Box flexDirection="column">
        <Box justifyContent="center">
          {e.props.placement === 'dock' ? (
            <Svg source={svg.source} alt={altText(m)} width={svg.width} height={svg.height} />
          ) : (
            <Svg source={svg.source} alt={altText(m)} />
          )}
        </Box>
        {actions}
      </Box>
    )
  })
}

/** The two actions, shown once the context asks for a fresh start. Hotkeys: H / N while the band has focus, and the chords anywhere. */
function actionRow(
  isShown: boolean,
  Box: unknown,
  Button: unknown,
  handoffKey: string,
  freshKey: string,
  onHandoff: () => unknown,
  onFresh: () => unknown,
) {
  if (!isShown) return null
  return h(
    Box as never,
    { key: 'actions', justifyContent: 'center', gap: 2 } as never,
    h(Button as never, { key: 'handoff', hotkey: 'h', variant: 'primary', onPress: onHandoff } as never, `New session with handoff (H · ${handoffKey})`),
    h(Button as never, { key: 'fresh', hotkey: 'n', onPress: onFresh } as never, `Fresh session (N · ${freshKey})`),
  ) as never
}
