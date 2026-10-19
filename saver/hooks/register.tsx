import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Saved } from '../types'
import { RANK, bandKey, hasAbove, stack } from './bands'
import {
  COLOR,
  CONTEXT_LIMIT,
  HAIKU_ID,
  bandWidth,
  dayKey,
  dividerSvg,
  labelLocally,
  money,
  priceOf,
  savingOf,
  shortName,
} from './lib'
import type { Level } from './lib'

const isOn = atom({ plugin: 'saver', key: 'isOn' } as const, true)
const last = atom({ plugin: 'saver', key: 'last' } as const, null)
const saved = atom({ plugin: 'saver', key: 'saved' } as const, { day: '', usd: 0 })

export const register: Register = on => {
  // What the current turn was labelled; set when the prompt arrives, read at each step.
  let turnLevel: Level = 'hard'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'saver',
      description: 'Route easy prompts to Haiku 5.5: /saver on or /saver off',
      argumentHint: 'on|off',
    })

    const storedOn = await $.store.get('isOn')
    if (typeof storedOn === 'boolean') await update($, isOn, () => storedOn)

    const storedSaved = (await $.store.get('saved')) as Saved | undefined
    if (storedSaved && typeof storedSaved.usd === 'number') {
      await update($, saved, () => storedSaved)
    }

    return next(e)
  })

  on('command.run', { command: 'saver' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await update($, isOn, () => arg === 'on')
      await $.store.set('isOn', arg === 'on')
      return { text: `saver ${arg}` }
    }
    const state = (await read($, isOn)) ? 'on' : 'off'
    return { text: `saver is ${state}. Use /saver on or /saver off.` }
  })

  on('prompt.submit', async ($, e, next) => {
    // A command, a hidden prompt, or one folded into a running turn keeps the turn's label.
    if (e.command || e.isMeta || e.turnId !== undefined) return next(e)

    turnLevel = 'hard'
    if (await read($, isOn)) {
      turnLevel = labelLocally(e.text)
      if (turnLevel === 'unclear') {
        try {
          const label = await $.model.classify(e.text, ['easy', 'hard'], {
            model: HAIKU_ID,
          })
          turnLevel = label === 'easy' ? 'easy' : 'hard'
        } catch {
          turnLevel = 'hard'
        }
      }
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)

    let isHaiku = false
    if (turnLevel === 'easy' && !e.model.toLowerCase().includes('haiku')) {
      let tokens = 0
      try {
        tokens = (await $.session.usage()).context.tokens ?? 0
      } catch {
        tokens = CONTEXT_LIMIT
      }
      isHaiku = (await read($, isOn)) && tokens < CONTEXT_LIMIT
    }

    const response = yield* next(isHaiku ? { ...e, model: HAIKU_ID } : e)

    const answered = response.usage?.model ?? (isHaiku ? HAIKU_ID : e.model)
    await update($, last, () => answered)

    const mainPrice = priceOf(e.model)
    if (isHaiku && response.usage && mainPrice) {
      const gain = savingOf(mainPrice, response.usage)
      const today = dayKey(await $.clock.now())
      const total = await update($, saved, s =>
        s.day === today ? { day: today, usd: s.usd + gain } : { day: today, usd: gain },
      )
      await $.store.set('saved', total)
    }

    return response
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const { Box, Text } = $.ui.resolve(e)
    const today = dayKey(await $.clock.now())
    const isEnabled = await read($, isOn)
    const model = await read($, last)
    const total = await read($, saved)
    const usd = total.day === today ? total.usd : 0

    // Under the bars, set apart by a rule with room around it (only when there are bars above).
    let divider = null
    if (hasAbove(below, RANK.saver)) {
      if (e.surface === 'terminal') {
        divider = (
          <Box justifyContent="center">
            <Text color={COLOR.track}>{'─'.repeat(Math.max(8, Math.min(e.props.bodyColumns - 4, 72)))}</Text>
          </Box>
        )
      } else {
        const { Svg } = $.ui.resolve(e)
        const d = dividerSvg(bandWidth(e.props.bodyColumns))
        divider = (
          <Box justifyContent="center">
            <Svg source={d.source} alt="divider" />
          </Box>
        )
      }
    }

    const mine = (
      <Box key={bandKey('saver')} flexDirection="column">
        {divider}
        <Box justifyContent="center">
          <Text color={isEnabled ? COLOR.green : COLOR.track}>●</Text>
          <Text color={COLOR.dim}> Saver {isEnabled ? 'on' : 'off'}</Text>
          <Text color={COLOR.track}>{'   |   '}</Text>
          <Text color={COLOR.dim}>Answered by </Text>
          <Text color={COLOR.text}>{model ? shortName(model) : '-'}</Text>
          <Text color={COLOR.track}>{'   |   '}</Text>
          <Text color={COLOR.dim}>Saved today </Text>
          <Text color={COLOR.green}>{money(usd)}</Text>
        </Box>
      </Box>
    )

    return stack(below, mine as never, Box)
  })
}
