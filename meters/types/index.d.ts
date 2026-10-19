export type Fill = { tokens: number; window: number; percent: number }
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    meters: {
      fill: Fill | null
      limits: Limit[]
      isSide: boolean
      tick: number
    }
  }
}
