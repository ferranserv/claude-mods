import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { altText, bandSvg, bandWidth, line, model, sideSvg, sideWidth } from './lib'

const PANE = 'meters'

const fill = atom({ plugin: 'meters', key: 'fill' } as const, null)
const limits = atom({ plugin: 'meters', key: 'limits' } as const, [])
const isSide = atom({ plugin: 'meters', key: 'isSide' } as const, false)
// Bumped when the side panel opens or closes, so the band above the prompt redraws.
const tick = atom({ plugin: 'meters', key: 'tick' } as const, 0)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'meters',
      description: 'Where the usage meters show: /meters side or /meters top',
      argumentHint: 'side|top',
    })

    const usage = await $.session.usage()
    await update($, limits, () => usage.rateLimits)
    const { tokens, window, percent } = usage.context
    if (tokens !== undefined && percent !== undefined) {
      await update($, fill, () => ({ tokens, window, percent }))
    }

    if ((await $.store.get('isSide')) === true) {
      await update($, isSide, () => true)
      void $.ui.open({ id: PANE, title: 'Usage' })
    }

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

    const m = model(
      { fill: await read($, fill), limits: await read($, limits), now: await $.clock.now() },
    )
    let mine

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      mine = (
        <Box justifyContent="center">
          {line(m).map(s => (
            <Text color={s.fill}>{s.t}</Text>
          ))}
        </Box>
      )
    } else {
      const { Box, Svg } = $.ui.resolve(e)
      const svg = bandSvg(bandWidth(e.props.bodyColumns), m)
      mine = (
        <Box justifyContent="center">
          <Svg source={svg.source} alt={altText(m)} width={svg.width} height={svg.height} />
        </Box>
      )
    }

    const { Box } = $.ui.resolve(e)
    return below.type === 'engine' ? (
      mine
    ) : (
      <Box flexDirection="column">
        {below}
        {mine}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const m = model(
      { fill: await read($, fill), limits: await read($, limits), now: await $.clock.now() },
    )

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          {line(m, 6).map(s => (
            <Text color={s.fill}>{s.t}</Text>
          ))}
        </Box>
      )
    }

    const { Box, Svg } = $.ui.resolve(e)
    const svg = sideSvg(sideWidth(e.props.bodyColumns), m)
    return (
      <Box justifyContent="center">
        <Svg source={svg.source} alt={altText(m)} width={svg.width} height={svg.height} />
      </Box>
    )
  })
}
