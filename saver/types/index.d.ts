export type Saved = { day: string; usd: number }

declare module 'claude-code' {
  interface PluginState {
    saver: {
      isOn: boolean
      last: string | null
      saved: Saved
    }
  }
}
