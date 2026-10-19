export type PlanPhase = 'researching' | 'planning' | 'building' | 'testing' | 'auditing'
export type PlanTask = { id: string; subject: string; status: 'pending' | 'in_progress' | 'completed' }
export type PlanSnap = {
  goal: string
  isGoalCmd: boolean
  tasks: PlanTask[]
  phase: PlanPhase
  visited: PlanPhase[]
  startedAt: number
  endedAt: number
  isRunning: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'plan-progress': { snap: PlanSnap }
  }
}
