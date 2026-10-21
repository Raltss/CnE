import { lastSubmittedAt } from '../../data/selectors'
import type { AppState } from '../../data/types'

/** Submitted packages: the manager's own first, then oldest submission first. */
export function reviewQueue(state: AppState, managerId: string) {
  return state.packages
    .filter((p) => p.status === 'submitted')
    .sort((a, b) => {
      const mineA = a.responsibleManagerId === managerId ? 0 : 1
      const mineB = b.responsibleManagerId === managerId ? 0 : 1
      if (mineA !== mineB) return mineA - mineB
      return (lastSubmittedAt(state, a.id) ?? '').localeCompare(lastSubmittedAt(state, b.id) ?? '')
    })
}
