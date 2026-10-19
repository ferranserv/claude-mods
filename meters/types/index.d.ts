export type Fill = { tokens: number; window: number; percent: number }
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Cache = {
  lastAt: number
  lastEndAt: number
  detected: 5 | 60 | null
  misses: number
  notifiedAt: number
  override: number | null
  fallback: number
}

declare module 'claude-code' {
  interface PluginState {
    meters: {
      fill: Fill | null
      limits: Limit[]
      isSide: boolean
      tick: number
      cache: Cache
      modelId: string
      isBusy: boolean
      lim: { warnPercent: number; redPercent: number; warnTokens: number }
    }
  }
}
