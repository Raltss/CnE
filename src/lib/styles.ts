// Shared class recipes so components stay consistent with design-system/cne/MASTER.md.

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55'
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'border border-danger bg-surface text-danger hover:bg-danger-bg',
}
const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm md:min-h-10',
}

export const buttonClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) =>
  cx(base, variants[variant], sizes[size], extra)

export const inputClasses = (invalid?: boolean) =>
  cx(
    'block w-full rounded-md border bg-surface px-3 py-2 text-base text-fg placeholder:text-muted-fg transition-colors duration-150 md:text-sm',
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
    invalid ? 'border-danger' : 'border-border-strong',
  )

export const cardClasses = 'rounded-lg border border-border bg-surface'

/** aria wiring for an input rendered inside <Field>. */
export function fieldAria(id: string, opts: { error?: string; hasHint?: boolean }) {
  const describedBy = [opts.hasHint ? `${id}-hint` : null, opts.error ? `${id}-error` : null].filter(Boolean).join(' ')
  return {
    id,
    'aria-invalid': opts.error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  } as const
}
