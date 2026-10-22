import type { ClientSurface } from 'claude-code'

/**
 * A press target: its region is exactly its drawing, and a pointer release anywhere on it posts a press to the hooks module
 * (the `ui.message` hook in register.tsx), which runs the action registered under this instance's key. No `$` here.
 */
type Props = { source: string; alt: string; width: number; height: number; isInteractive: boolean }

export default function Press(props: Props, surface: ClientSurface) {
  surface.onPointer(e => {
    if (e.type === 'up') surface.post({ press: true })
  })
  const { Svg } = surface.elements as unknown as { Svg: unknown }
  return h(Svg as never, { source: props.source, alt: props.alt, width: props.width, height: props.height, isInteractive: props.isInteractive }) as never
}
