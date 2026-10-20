export type Saved = { day: string; usd: number }
export type StripMode = 'active' | 'on' | 'always'

declare module 'claude-code' {
  interface PluginState {
    saver: {
      isOn: boolean
      last: string | null
      saved: Saved
      mode: StripMode
      lastRouted: boolean
    }
  }
}
