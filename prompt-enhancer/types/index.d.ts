export type EnhancerState = { hasDraft: boolean; isBusy: boolean; original: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-enhancer': { state: EnhancerState }
  }
}
