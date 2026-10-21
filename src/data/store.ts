// The one place the app's data backend is chosen. UI code reads through the
// hooks in ./hooks and writes through `api`; it never talks to Supabase or
// localStorage directly.
import { supabase, useDemoData } from '../lib/supabase'
import type { Backend } from './backend'
import { createDemoBackend, type DemoBackend } from './demoBackend'
import { createSupabaseBackend } from './supabaseBackend'

export type DataMode = 'supabase' | 'demo' | 'unconfigured'

export const dataMode: DataMode = useDemoData ? 'demo' : supabase ? 'supabase' : 'unconfigured'

const demoBackend: DemoBackend | null = dataMode === 'demo' ? createDemoBackend() : null

const unconfigured: Backend = {
  getState: () => null,
  getStatus: () => ({ phase: 'error', error: 'Supabase isn’t configured.' }),
  subscribe: () => () => {},
  start() {},
  stop() {},
  reload: () => Promise.resolve(),
  // Every command fails with the same message. App shows a setup screen first, so this is a safety net.
  api: new Proxy({} as Backend['api'], {
    get: () => () => Promise.resolve({ ok: false, error: 'Supabase isn’t configured.' }),
  }),
}

export const appStore: Backend = demoBackend ?? (supabase ? createSupabaseBackend(supabase) : unconfigured)

export const api = appStore.api

/** Demo-only: restore the sample data (the demo bar's "Reset demo data"). */
export const resetDemoData = demoBackend ? () => demoBackend.resetDemoData() : null
