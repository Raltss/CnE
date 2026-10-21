import { isActive } from '../../data/selectors'
import type { AppState } from '../../data/types'

export function myPackages(state: AppState, editorId: string) {
  return state.packages.filter((p) => p.editorId === editorId)
}

export const myActive = (state: AppState, editorId: string) =>
  myPackages(state, editorId)
    .filter(isActive)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))

export const myNeedsChanges = (state: AppState, editorId: string) =>
  myActive(state, editorId).filter((p) => p.status === 'apply_feedback')

/** Finished work stays visible to the editor for tracking. */
export const myHistory = (state: AppState, editorId: string) =>
  myPackages(state, editorId)
    .filter((p) => !isActive(p))
    .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))
