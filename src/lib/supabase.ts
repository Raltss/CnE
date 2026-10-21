import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/**
 * The browser client. It only ever holds the publishable key; what each person
 * can read and do is decided by Row Level Security and the database functions.
 * Null when the env vars are missing (App shows a setup screen).
 */
export const supabase = url && publishableKey ? createClient(url, publishableKey) : null
