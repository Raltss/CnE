// Light or dark colors (tokens in src/index.css). The choice belongs to this browser,
// not the account, and "system" follows the device setting. index.html applies the
// same rule before the first paint; keep the two in step.
import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

const KEY = 'cne-theme'
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system' // storage blocked: follow the device
  }
}

let state = resolve(readChoice())

function resolve(choice: ThemeChoice): { choice: ThemeChoice; theme: Theme } {
  return { choice, theme: choice === 'system' ? (darkQuery.matches ? 'dark' : 'light') : choice }
}

function update(choice: ThemeChoice) {
  state = resolve(choice)
  document.documentElement.dataset.theme = state.theme
  listeners.forEach((listener) => listener())
}

darkQuery.addEventListener('change', () => update(state.choice))
// Another tab changed it.
window.addEventListener('storage', (event) => {
  if (event.key === KEY) update(readChoice())
})

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Not saved, but it still applies until the page reloads.
  }
  update(choice)
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The person's choice and the theme showing now. */
export function useTheme() {
  return useSyncExternalStore(subscribe, () => state)
}
