// Self-contained contract (an import is refused). Keep Advice in step with hooks/logic.ts.
export type Notice = { text: string; isError: boolean }

export type Advice =
  | { kind: 'main'; branch: string }
  | { kind: 'dirty'; count: number; onDefault: boolean; add: number; del: number }
  | { kind: 'shared-folder'; peerIds: string[] }
  | { kind: 'peer-working'; peerId: string; branch: string; cwd: string; isGone: boolean }
  | { kind: 'peer-done'; peerId: string; branch: string; cwd: string; take: number; leave: number; secrets: number; isSole: boolean; add: number; del: number }

declare module 'claude-code' {
  interface PluginState {
    'preflight-guard': {
      isOn: boolean
      advice: Advice[]
      isDismissed: boolean
      pending: string | null
      notice: Notice | null
    }
  }
}
