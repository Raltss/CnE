import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Opt-in offline demo (localStorage, demo account switcher, no sign-in). */
export const useDemoData = import.meta.env.VITE_USE_DEMO_DATA === 'true'

/**
 * The browser client. It only ever holds the publishable (anon) key; what each
 * person can read and do is decided by Row Level Security and the workflow
 * functions in the database. Null when demo mode is on or the env vars are missing.
 */
export const supabase = !useDemoData && url && publishableKey ? createClient(url, publishableKey) : null
