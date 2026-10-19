import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PlanSnap } from '../types'
import { bandKey, stack } from './bands'
import {
  EMPTY,
  PHASES,
  applyGoalCommand,
  applyPrompt,
  applyTool,
  applyTurnEnd,
  bar,
  clip,
  firstLine,
  fmtTime,
  isActive,
  isAllDone,
  percent,
  toolPhase,
  windowTasks,
} from './logic'

const snapRef = { plugin: 'plan-progress', key: 'snap' } as const
const snapAtom = atom(snapRef, EMPTY)

const MAX_CHECKLIST = 6
const MARK = { completed: '✔', in_progress: '◐', pending: '○' } as const

// Cache for the ticker only; the snapshot itself lives in $.state.
let isTicking = false

function commit($: EngineInterface, fn: (s: PlanSnap) => PlanSnap) {
  return update($, snapAtom, s => {
    const n = fn(s)
    isTicking = n.isRunning && n.startedAt > 0 && isActive(n)
    return n
  })
}

export const register: Register = (on, options) => {
  const minSteps = Math.max(1, Number(options.minSteps ?? 2) || 2)
  const hasSound = options.sound !== false

  let promptAt = 0
  let promptText = ''
  let lastPhase = ''

  on('session.start', async ($, e, next) => {
    const { value } = await $.state.get(snapRef)
    isTicking = !!value && value.isRunning && isActive(value)
    $.clock.every(1000, () => {
      if (isTicking) $.ui.invalidate('ui.render')
    })
    await $.command.register({ name: 'plan-reset', description: 'Clear the Plan Progress panel.' })
    return next(e)
  })

  on('command.run', { command: 'plan-reset' }, async $ => {
    await commit($, () => EMPTY)
    return { text: 'Plan Progress cleared.' }
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await commit($, () => EMPTY)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    const ctx = { now, promptAt, promptText }
    if (e.command) {
      if (e.command.name === 'goal') await commit($, s => applyGoalCommand(s, e.command?.args ?? '', ctx))
      return next(e)
    }
    if (!e.isMeta) {
      promptAt = now
      promptText = e.text
      await commit($, s => applyPrompt(s, ctx))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>

    const guess = toolPhase(tool, input, lastPhase === '' ? 'researching' : (lastPhase as PlanSnap['phase']))
    if (guess !== undefined && guess !== lastPhase) {
      lastPhase = guess
      await commit($, s => (isActive(s) ? { ...s, phase: guess } : s))
    }

    const ran = await next(e)

    const { deny, isError, result } = ran as { deny?: string; isError?: boolean; result?: unknown }
    if (deny === undefined && isError !== true) {
      const now = await $.clock.now()
      const ctx = { now, promptAt, promptText }
      await commit($, s => applyTool(s, tool, input, result, ctx))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await commit($, s => applyTurnEnd(s, now))
      if (hasSound && e.reason !== 'aborted') void $.audio.play({ asset: 'sounds/done.wav' }).catch(() => undefined)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Other mods draw in this band too: take what sits beneath first and stack under it.
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const s = await read($, snapAtom)
    const isShown = s.isGoalCmd || s.tasks.length >= minSteps
    if (!isShown) return below

    const { Box, Text } = $.ui.resolve(e)
    const cols = Math.max(20, e.props.bodyColumns)
    const now = await $.clock.now()
    const elapsed = fmtTime((s.isRunning ? now : s.endedAt || now) - s.startedAt)
    const pct = percent(s)
    const done = s.tasks.filter(t => t.status === 'completed').length
    const isDone = isAllDone(s)
    const counts = s.tasks.length > 0 ? `${done}/${s.tasks.length} steps` : 'no task list yet'
    const tail = ` ${s.tasks.length > 0 ? `${pct}%` : '—'}  ${counts}  ⏱ ${elapsed}`
    const barWidth = Math.max(8, Math.min(28, cols - tail.length - 2))
    // Leave room for the bands stacked with this one (meters, saver, Enhance).
    const rows = Math.max(1, Math.min(MAX_CHECKLIST, e.props.maxRows - 9))
    const { shown, hidden } = windowTasks(s.tasks, rows)
    const phaseLine = isDone
      ? '✔ complete'
      : cols >= 60
        ? PHASES.map(p => (p === s.phase ? `[${p}]` : p)).join(' › ')
        : s.phase

    const mine = (
      <Box key={bandKey('plan-progress')} flexDirection="column" paddingX={1}>
        <Text wrap="truncate">
          <Text bold color="cyan">Goal </Text>
          {clip(s.goal || 'working…', cols - 8)}
        </Text>
        <Text wrap="truncate" color={isDone ? 'green' : 'yellow'}>{phaseLine}</Text>
        <Text wrap="truncate">
          <Text color={isDone ? 'green' : 'cyan'}>{bar(pct, barWidth)}</Text>
          {tail}
        </Text>
        {shown.map(t => (
          <Text key={t.id} wrap="truncate" dimColor={t.status === 'completed'} bold={t.status === 'in_progress'}>
            {MARK[t.status]} {clip(firstLine(t.subject), cols - 4)}
          </Text>
        ))}
        {hidden > 0 && <Text dimColor>  +{hidden} more</Text>}
      </Box>
    )

    return stack(below, mine as never, Box)
  })
}
