import type { AppState, FieldErrors, PackageInput, StaffAccountInput, SubmissionInput } from './types'

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.')
  } catch {
    return false
  }
}

const URL_HINT = 'Enter a full link starting with https://'

export type PackageField = keyof PackageInput | `referenceLinks.${number}`

export function validatePackageInput(
  state: AppState,
  input: PackageInput,
  options: { previousDeadline?: string; now: Date },
): FieldErrors<PackageField> {
  const errors: FieldErrors<PackageField> = {}
  const title = input.title.trim()
  if (!title) errors.title = 'Title is required.'
  else if (title.length > 120) errors.title = 'Keep the title under 120 characters.'

  const client = state.clients.find((c) => c.id === input.clientId)
  if (!client) errors.clientId = 'Choose a client.'
  const product = state.products.find((p) => p.id === input.productId)
  if (!product) errors.productId = 'Choose a product.'
  else if (client && product.clientId !== client.id) errors.productId = 'This product belongs to another client.'

  if (input.briefLink.trim() && !isHttpUrl(input.briefLink.trim())) errors.briefLink = URL_HINT
  input.referenceLinks.forEach((link, index) => {
    if (link.trim() && !isHttpUrl(link.trim())) errors[`referenceLinks.${index}`] = URL_HINT
  })

  const editor = state.people.find((p) => p.id === input.editorId)
  if (!editor || editor.role !== 'editor') errors.editorId = 'Choose the editor for this package.'
  const manager = state.people.find((p) => p.id === input.responsibleManagerId)
  if (!manager || manager.role !== 'manager') errors.responsibleManagerId = 'Choose a responsible manager.'

  if (!input.deadline) errors.deadline = 'Set the final deadline.'
  else {
    const due = new Date(input.deadline)
    if (Number.isNaN(due.getTime())) errors.deadline = 'Enter a valid date and time.'
    else if (input.deadline !== options.previousDeadline && due.getTime() <= options.now.getTime())
      errors.deadline = 'The deadline must be in the future.'
  }
  return errors
}

export function validateSubmissionInput(input: SubmissionInput): FieldErrors<keyof SubmissionInput | 'form'> {
  const errors: FieldErrors<keyof SubmissionInput | 'form'> = {}
  const review = input.reviewLink.trim()
  const delivery = input.deliveryLink.trim()
  if (!review && !delivery) errors.form = 'Add a review link, a delivery link, or both.'
  if (review && !isHttpUrl(review)) errors.reviewLink = URL_HINT
  if (delivery && !isHttpUrl(delivery)) errors.deliveryLink = URL_HINT
  return errors
}

// ── Accounts and passwords ──────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Supabase Auth's minimum here is 8 (supabase/config.toml); bcrypt reads at most 72 characters. */
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72

function passwordError(password: string): string | undefined {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`
  return undefined
}

/** Same rules as supabase/functions/create-staff-account, plus a duplicate-email hint. */
export function validateStaffAccountInput(state: AppState, input: StaffAccountInput): FieldErrors<keyof StaffAccountInput> {
  const errors: FieldErrors<keyof StaffAccountInput> = {}
  const name = input.fullName.trim()
  const email = input.email.trim().toLowerCase()
  if (!name) errors.fullName = 'Enter their full name.'
  else if (name.length > 80) errors.fullName = 'Keep the name under 80 characters.'
  if (!EMAIL.test(email)) errors.email = 'Enter a valid email address.'
  else if (state.accounts.some((a) => a.email.toLowerCase() === email)) errors.email = 'An account with this email already exists.'
  if (input.title.trim().length > 80) errors.title = 'Keep the title under 80 characters.'
  if (input.role !== 'manager' && input.role !== 'editor') errors.role = 'Choose manager or editor.'
  const password = passwordError(input.password)
  if (password) errors.password = password
  return errors
}

export function validateNewPassword(password: string, confirm: string): FieldErrors<'password' | 'confirm'> {
  const errors: FieldErrors<'password' | 'confirm'> = {}
  const problem = passwordError(password)
  if (problem) errors.password = problem
  if (!problem && confirm !== password) errors.confirm = 'The passwords don’t match.'
  return errors
}
