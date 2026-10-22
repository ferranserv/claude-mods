import type { ClientSurface } from 'claude-code'

/**
 * A press region: it draws nothing (its table has no Svg; the drawing is under it, in the hooks module) and a pointer release
 * anywhere on it posts a press to the hooks module (the `ui.message` hook in register.tsx), which runs the action registered
 * under this instance's key. No `$` here.
 */
export default function Press(_props: unknown, surface: ClientSurface) {
  surface.onPointer(e => {
    if (e.type === 'up') surface.post({ press: true })
  })
  const { Box } = surface.elements
  return h(Box as never, {}) as never
}
