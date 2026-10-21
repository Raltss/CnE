// Admin "Add user": creates a manager's or editor's sign-in account with a
// temporary password (no email is sent), then grants the role through
// approve_account() using the calling admin's own token, so the database
// checks it and records it under that admin.
//
// Runs on Supabase Edge Functions, the only place the service-role key is used;
// it never reaches the browser. Deploy: npx supabase functions deploy create-staff-account
// The input rules mirror validateStaffAccountInput() in src/data/validation.ts. Keep them in step.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Field = 'fullName' | 'email' | 'title' | 'role' | 'password'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** Legacy key names first, then the newer JSON key lists if a project only has those. */
function key(legacy: string, modern: string): string | undefined {
  const direct = Deno.env.get(legacy)
  if (direct) return direct
  try {
    const keys = JSON.parse(Deno.env.get(modern) ?? '{}') as Record<string, string>
    return keys.default ?? Object.values(keys)[0]
  } catch {
    return undefined
  }
}

function validate(input: Record<string, unknown>) {
  const text = (field: Field) => (typeof input[field] === 'string' ? (input[field] as string) : '')
  const value = {
    fullName: text('fullName').trim(),
    email: text('email').trim().toLowerCase(),
    title: text('title').trim(),
    role: text('role'),
    password: text('password'),
  }
  const errors: Partial<Record<Field, string>> = {}
  if (!value.fullName) errors.fullName = 'Enter their full name.'
  else if (value.fullName.length > 80) errors.fullName = 'Keep the name under 80 characters.'
  if (!EMAIL.test(value.email)) errors.email = 'Enter a valid email address.'
  if (value.title.length > 80) errors.title = 'Keep the title under 80 characters.'
  if (value.role !== 'manager' && value.role !== 'editor') errors.role = 'Choose manager or editor.'
  if (value.password.length < 8) errors.password = 'Use at least 8 characters.'
  else if (value.password.length > 72) errors.password = 'Use at most 72 characters.'
  return { value, errors }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' })

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = key('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS')
  const serviceKey = key('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS')
  if (!url || !anonKey || !serviceKey) return reply(500, { error: 'The Add user function is missing its Supabase settings.' })

  // 1. Who is calling? Supabase Auth verifies the token; the database says whether they're an active admin.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: auth } = await asCaller.auth.getUser(token)
  if (!auth.user) return reply(401, { error: 'Your session has expired. Sign in again.' })
  const { data: caller } = await asCaller.from('profiles').select('role, is_active').eq('id', auth.user.id).maybeSingle()
  if (caller?.role !== 'admin' || !caller.is_active) return reply(403, { error: 'Only admins can add users.' })

  // 2. Check the details.
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return reply(400, { error: 'Send the new person’s details as JSON.' })
  const { value, errors } = validate(body as Record<string, unknown>)
  if (Object.keys(errors).length) return reply(400, { error: 'Fix the highlighted fields.', fieldErrors: errors })

  // 3. Create the account: already confirmed, so no email is sent.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: value.email,
    password: value.password,
    email_confirm: true,
    user_metadata: { full_name: value.fullName, title: value.title },
    app_metadata: { created_by: auth.user.id, must_change_password: true },
  })
  if (createError || !created.user) {
    const message = createError?.message ?? 'Couldn’t create the account.'
    if (createError?.code === 'email_exists' || /already (been )?registered|already exists/i.test(message))
      return reply(409, { error: 'Fix the highlighted fields.', fieldErrors: { email: 'An account with this email already exists.' } })
    if (createError?.code === 'weak_password' || /password/i.test(message))
      return reply(400, { error: 'Fix the highlighted fields.', fieldErrors: { password: message } })
    return reply(400, { error: message })
  }

  // 4. Grant the role as the admin. If the database refuses, undo the account.
  const { error: roleError } = await asCaller.rpc('approve_account', { p_profile_id: created.user.id, p_role: value.role })
  if (roleError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return reply(400, { error: `The account wasn’t created: ${roleError.message}` })
  }
  return reply(200, { id: created.user.id })
})
