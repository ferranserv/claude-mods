import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { EnhancerState } from '../types'
import { SYSTEM, buildPrompt, cleanOutput, clip, matchesChord, parseChord, pickSkills } from './logic'
import type { SkillInfo } from './logic'

const stateRef = { plugin: 'prompt-enhancer', key: 'state' } as const
const INITIAL: EnhancerState = { hasDraft: false, isBusy: false, original: '' }
const stateAtom = atom(stateRef, INITIAL)

type Cfg = { model: string; maxSkills: number }

// Guards against a second Enhance while one runs; the visible flags live in $.state.
let isRunning = false
let lastHasDraft = false

function patch($: EngineInterface, p: Partial<EnhancerState>) {
  return update($, stateAtom, s => ({ ...s, ...p }))
}

async function setDraft($: EngineInterface, text: string) {
  const has = text.trim() !== '' && !text.trimStart().startsWith('/')
  if (has === lastHasDraft) return
  lastHasDraft = has
  await patch($, { hasDraft: has })
}

async function tryRead($: EngineInterface, path: string, width: number): Promise<string> {
  try {
    return clip((await $.fs.read(path)).trim(), width)
  } catch {
    return ''
  }
}

async function run($: EngineInterface, argv: string[]): Promise<string> {
  try {
    const r = await $.process.run(argv, { timeoutMs: 4000 })
    return r.exitCode === 0 ? r.stdout.trim() : ''
  } catch {
    return ''
  }
}

async function collectSkills($: EngineInterface, draft: string, max: number): Promise<SkillInfo[]> {
  try {
    const cmds = await $.command.list()
    const own = new Set(['enhance'])
    const skills = cmds
      .filter(c => (c.source === 'user' || c.source === 'plugin') && !own.has(c.name))
      .map(c => ({ name: c.name, description: c.description }))
    return pickSkills(draft, skills, max)
  } catch {
    return []
  }
}

async function collectProject($: EngineInterface): Promise<string> {
  const [rules, readme, progress, request, pkg, toml, listing, git, log] = await Promise.all([
    tryRead($, 'CLAUDE.md', 1800),
    tryRead($, 'README.md', 700),
    tryRead($, 'PROGRESS.md', 600),
    tryRead($, 'REQUEST.md', 500),
    tryRead($, 'package.json', 1200),
    tryRead($, 'pyproject.toml', 600),
    $.fs.list('.').then(
      es => es.filter(x => !x.name.startsWith('.')).map(x => (x.kind === 'dir' ? `${x.name}/` : x.name)).slice(0, 40).join(' '),
      () => '',
    ),
    run($, ['git', 'status', '--short', '--branch']),
    run($, ['git', 'log', '-3', '--oneline']),
  ])
  const parts: [string, string][] = [
    ['CLAUDE.md', rules],
    ['README (head)', rules ? '' : readme],
    ['REQUEST.md', request],
    ['PROGRESS.md', progress],
    ['package.json', pkg],
    ['pyproject.toml', toml],
    ['top-level files', listing],
    ['git status', clip(git, 500)],
    ['recent commits', log],
  ]
  return parts.filter(([, v]) => v !== '').map(([k, v]) => `## ${k}\n${v}`).join('\n\n')
}

/** Rewrites the draft in the prompt box. Returns a one-line status for a command's output. */
async function enhance($: EngineInterface, cfg: Cfg, given?: string): Promise<string> {
  if (isRunning) return 'Already enhancing.'
  isRunning = true
  try {
    const draft = (given ?? (await $.prompt.read()).text).trim()
    if (draft === '') {
      $.ui.toast('Type a draft first, then Enhance.')
      return 'Nothing to enhance.'
    }
    await patch($, { isBusy: true })
    $.ui.status('✦ enhancing…')

    const [skills, project] = await Promise.all([collectSkills($, draft, cfg.maxSkills), collectProject($)])
    const r = await $.model.complete({
      model: cfg.model,
      system: SYSTEM,
      prompt: buildPrompt(draft, skills, project),
      maxTokens: 1600,
      effort: 'low',
      timeoutMs: 60000,
    })
    if (!r.isAnswered) {
      $.ui.toast(`Enhance failed (${r.reason}). Your draft is untouched.`)
      return `Enhance failed: ${r.reason}.`
    }

    const filled = await $.prompt.fill({ text: cleanOutput(r.text), mode: 'replace' })
    if (!filled.isFilled) {
      $.ui.toast('Enhanced, but the prompt box is busy. Your draft is untouched.')
      return 'Prompt box unavailable.'
    }
    await patch($, { original: draft, hasDraft: true })
    lastHasDraft = true
    $.ui.toast('Enhanced. Edit it, then press Enter. ↩ restores your draft.')
    return 'Enhanced draft placed in the prompt box.'
  } catch (err) {
    $.ui.toast('Enhance failed. Your draft is untouched.')
    return 'Enhance failed.'
  } finally {
    isRunning = false
    $.ui.status(undefined)
    await patch($, { isBusy: false })
  }
}

async function undo($: EngineInterface) {
  const { original } = await read($, stateAtom)
  if (original === '') return
  await $.prompt.fill({ text: original, mode: 'replace' })
  await patch($, { original: '' })
}

export const register: Register = (on, options) => {
  const cfg: Cfg = {
    model: typeof options.model === 'string' && options.model.trim() !== '' ? options.model.trim() : 'haiku',
    maxSkills: Math.max(1, Number(options.maxSkills ?? 12) || 12),
  }
  const hotkey = typeof options.hotkey === 'string' ? options.hotkey : 'meta+e'
  const chord = parseChord(hotkey)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'enhance',
      description: 'Rewrite a draft prompt with fitting skills, project context, questions and a definition of done.',
      argumentHint: '<draft>',
    })
    return next(e)
  })

  on('command.run', { command: 'enhance' }, async ($, e) => {
    const draft = e.args.trim()
    if (draft === '') return { text: `Type a draft, then press ✦${chord ? ` or ${hotkey}` : ''}. Or run /enhance <draft>.` }
    return { text: await enhance($, cfg, draft) }
  })

  on('prompt.edit', async ($, e, next) => {
    if (matchesChord(chord, e.key)) {
      $.clock.after(0, () => void enhance($, cfg))
      return { text: e.text, cursor: e.cursor }
    }
    const r = await next(e)
    await setDraft($, r.text)
    return r
  }).catch(($, e, next) => next(e))

  on('prompt.change', async ($, e, next) => {
    const r = await next(e)
    await setDraft($, r.text)
    return r
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    lastHasDraft = false
    await patch($, { hasDraft: false, original: '' })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Other mods draw in this band too: take what sits beneath first and stack under it.
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const s = await read($, stateAtom)
    if (!s.hasDraft && !s.isBusy && s.original === '') return below

    const { Box, Button, Text } = $.ui.resolve(e)
    const stack = (mine: JSX.Element) =>
      below.type === 'engine' ? (
        mine
      ) : (
        <Box flexDirection="column">
          {below}
          {mine}
        </Box>
      )
    if (s.isBusy) {
      return stack(
        <Box justifyContent="flex-end" paddingX={1}>
          <Text dimColor>✦ enhancing…</Text>
        </Box>,
      )
    }
    return stack(
      <Box justifyContent="flex-end" paddingX={1} gap={2}>
        {s.original !== '' && (
          <Box key="undo-wrap">
            <Button key="undo" plain dimColor onPress={() => undo($)}>↩</Button>
            <Box position="absolute" top={-1} right={0} display="none" hover={{ display: 'flex' }}>
              <Text dimColor>Restore my draft</Text>
            </Box>
          </Box>
        )}
        <Box key="enhance-wrap">
          <Button key="enhance" plain hotkey="e" onPress={() => enhance($, cfg)}>✦</Button>
          <Box position="absolute" top={-1} right={0} display="none" hover={{ display: 'flex' }}>
            <Text dimColor>Enhance{chord ? ` (${hotkey})` : ''}</Text>
          </Box>
        </Box>
      </Box>,
    )
  })
}
