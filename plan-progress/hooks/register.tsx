import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PlanSnap } from '../types'
import { bandKey, stack } from './bands'
import { planSvg } from './plan-svg'
import {
  EMPTY,
  PHASES,
  applyGoalCommand,
  applyPrompt,
  applyTool,
  applyTurnEnd,
  applyTurnStart,
  bar,
  clip,
  firstLine,
  fmtTime,
  isActive,
  isAllDone,
  isTaskTool,
  nudgeNote,
  percent,
  toolPhase,
  withVisited,
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
  const hasNudge = options.nudge !== false
  const nudgeAfter = Math.max(2, Number(options.nudgeAfter ?? 6) || 6)

  let promptAt = 0
  let promptText = ''
  let lastPhase = ''
  // Tool names seen this session, for /plan-debug: what the app really sends decides what the panel can show.
  const seen: Record<string, number> = {}
  let lastShape = ''
  // Tool calls since the model last touched its task list.
  let calls = 0

  on('session.start', async ($, e, next) => {
    const { value } = await $.state.get(snapRef)
    isTicking = !!value && value.isRunning && isActive(value)
    $.clock.every(1000, () => {
      if (isTicking) $.ui.invalidate('ui.render')
    })
    try {
      await $.command.register({ name: 'plan-reset', description: 'Clear the Plan Progress panel.' })
    } catch {
      // The name is taken: the panel works without the command.
    }
    try {
      await $.command.register({ name: 'plan-debug', description: 'What Plan Progress has seen: tool names, task list, phase.' })
    } catch {
      // The name is taken: nothing else depends on it.
    }
    return next(e)
  })

  on('command.run', { command: 'plan-reset' }, async $ => {
    await commit($, () => EMPTY)
    return { text: 'Plan Progress cleared.' }
  })

  on('command.run', { command: 'plan-debug' }, async $ => {
    const snap = await read($, snapAtom)
    const tools = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, n]) => `${k}x${n}`).join(' ') || 'none yet'
    return {
      text: `Tools seen: ${tools}. Task list: ${snap.tasks.length} (${snap.tasks.filter(t => t.status === 'completed').length} done). Goal: ${snap.goal ? `"${clip(snap.goal, 60)}"` : 'none'}${snap.isGoalCmd ? ' (from /goal)' : ''}. Phase: ${snap.phase}. Running: ${snap.isRunning ? 'yes' : 'no'}. Last plan-like call: ${lastShape || 'none'}`,
    }
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
    seen[tool] = (seen[tool] ?? 0) + 1
    const input = e as unknown as Record<string, unknown>
    if (/todo|plan|task|step/i.test(tool)) lastShape = `${tool} ${JSON.stringify(input, (k, v) => (k === 'tool_use_id' ? undefined : v)).slice(0, 220)}`

    const guess = toolPhase(tool, input, lastPhase === '' ? 'researching' : (lastPhase as PlanSnap['phase']))
    if (guess !== undefined && guess !== lastPhase) {
      lastPhase = guess
      await commit($, s => (isActive(s) ? withVisited({ ...s, phase: guess }) : s))
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

  // The model is the only one who knows a step is done: when it stops saying so, remind it (a few tokens).
  on('classic.PostToolUse', async ($, e, next) => {
    const out = await next(e)
    if (!hasNudge) return out
    if (isTaskTool(String(e.tool_name))) {
      calls = 0
      return out
    }
    calls += 1
    const note = nudgeNote(await read($, snapAtom), calls, nudgeAfter)
    if (note === undefined) return out
    calls = 0
    return { ...out, additionalContext: [...(out.additionalContext ?? []), note] }
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await commit($, s => applyTurnStart(s))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await commit($, s => applyTurnEnd(s, now))
      if (hasSound && e.reason !== 'aborted') {
        void $.audio.play({ asset: 'sounds/done.wav' }).catch(() => undefined)
        // $.audio.play only has a player on macOS; Windows gets the same clip through PowerShell.
        if ((await $.env.get('OS')) === 'Windows_NT') {
          const wav = `${$.plugin.root}/sounds/done.wav`.replace(/'/g, "''")
          void $.process
            .run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${wav}').PlaySync()`], { timeoutMs: 5000 })
            .catch(() => undefined)
        }
      }
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

    const { Box, Button } = $.ui.resolve(e)
    const cols = Math.max(20, e.props.bodyColumns)
    const now = await $.clock.now()
    const elapsed = fmtTime((s.isRunning ? now : s.endedAt || now) - s.startedAt)
    const pct = percent(s)
    const done = s.tasks.filter(t => t.status === 'completed').length
    const isDone = isAllDone(s)
    // Leave room for the bands stacked with this one (meters, saver, Enhance).
    const rows = Math.max(1, Math.min(MAX_CHECKLIST, e.props.maxRows - 9))
    const { shown, hidden } = windowTasks(s.tasks, rows)
    const dismiss = (
      <Button key="dismiss" plain dimColor onPress={() => commit($, () => EMPTY)}>
        ✕
      </Button>
    )

    let body
    if (e.surface === 'terminal') {
      const { Text } = $.ui.resolve(e)
      const counts = s.tasks.length > 0 ? `${done}/${s.tasks.length} steps` : 'no task list yet'
      const tail = ` ${s.tasks.length > 0 ? `${pct}%` : '—'}  ${counts}  ⏱ ${elapsed}`
      const barWidth = Math.max(8, Math.min(28, cols - tail.length - 2))
      const phaseLine = isDone
        ? '✔ complete'
        : cols >= 60
          ? PHASES.map(p => (p === s.phase ? `[${p}]` : s.visited.includes(p) ? `✔${p}` : p)).join(' › ') + (s.isRunning ? '' : '  (idle)')
          : s.isRunning ? s.phase : `idle · last: ${s.phase}`
      body = (
        <Box flexDirection="column" paddingX={1}>
          <Box justifyContent="space-between">
            <Text wrap="truncate">
              <Text bold color="cyan">Goal </Text>
              {clip(s.goal || 'working…', cols - 12)}
            </Text>
            {dismiss}
          </Box>
          <Text wrap="truncate" color={isDone ? 'green' : s.isRunning ? 'yellow' : undefined} dimColor={!isDone && !s.isRunning}>{phaseLine}</Text>
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
    } else {
      const { Svg } = $.ui.resolve(e)
      const svg = planSvg(Math.max(320, Math.min(1600, Math.round(cols * 8))) - 44, {
        goal: s.goal,
        phase: s.phase,
        visited: s.visited,
        isDone,
        isRunning: s.isRunning,
        pct,
        done,
        total: s.tasks.length,
        elapsed,
        shown,
        hidden,
      })
      body = (
        <Box justifyContent="space-between" paddingX={1}>
          <Svg source={svg.source} alt={`Plan: ${s.goal || 'working'}, ${done} of ${s.tasks.length} steps, ${elapsed}`} />
          {dismiss}
        </Box>
      )
    }

    const mine = <Box key={bandKey('plan-progress')} flexDirection="column">{body}</Box>

    return stack(below, mine as never, Box)
  })
}
