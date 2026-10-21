// Self-contained contract (an import is refused). Keep the shapes in step with hooks/lib.ts,
// hooks/saver-logic.ts, hooks/preflight-logic.ts and hooks/enhancer-logic.ts.
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
export type Saved = { day: string; usd: number }
export type Notice = { text: string; isError: boolean }
export type EnhancerState = { hasDraft: boolean; isBusy: boolean; original: string }
export type Advice =
  | { kind: 'main'; branch: string }
  | { kind: 'dirty'; count: number; onDefault: boolean; add: number; del: number }
  | { kind: 'shared-folder'; peerIds: string[] }
  | { kind: 'peer-working'; peerId: string; branch: string; cwd: string; isGone: boolean }
  | { kind: 'peer-done'; peerId: string; branch: string; cwd: string; take: number; leave: number; secrets: number; isSole: boolean; add: number; del: number }

declare module 'claude-code' {
  interface PluginState {
    cockpit: {
      // usage meters
      fill: Fill | null
      limits: Limit[]
      isSide: boolean
      tick: number
      cache: Cache
      modelId: string
      isBusy: boolean
      lim: { warnPercent: number; redPercent: number; warnTokens: number }
      // saver
      saverOn: boolean
      saverSaved: Saved
      lastRouted: boolean
      // preflight
      preflightOn: boolean
      advice: Advice[]
      isDismissed: boolean
      pending: string | null
      notice: Notice | null
      // prompt enhancer
      enhancer: EnhancerState
      // whether the … menu under the bubble is open
      menu: boolean
    }
  }
}
