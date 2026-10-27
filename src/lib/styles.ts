// Shared class recipes so components stay consistent with design-system/cne/MASTER.md.

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

// One height and radius per size; hover changes the fill one step, press scales to 0.98.
const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap select-none transition-[background-color,border-color,color,box-shadow,scale] duration-120 ease-out active:not-disabled:scale-98 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0'
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:not-disabled:bg-primary-hover',
  secondary: 'border border-border-strong/70 bg-surface text-fg hover:not-disabled:border-border-strong hover:not-disabled:bg-surface-2',
  ghost: 'text-fg hover:not-disabled:bg-surface-2',
  danger: 'border border-danger/60 bg-surface text-danger hover:not-disabled:border-danger hover:not-disabled:bg-danger-bg',
}
const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-12 px-4 text-ui md:min-h-11',
}

export const buttonClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) =>
  cx(base, variants[variant], sizes[size], extra)

/** Square icon-only button (top bar, copy, close). Pair with an aria-label. */
export const iconButtonClasses = (extra?: string) =>
  cx(
    'inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-fg transition-colors duration-120 hover:bg-surface-2 hover:text-fg [&_svg]:size-4.5',
    extra,
  )

export const inputClasses = (invalid?: boolean) =>
  cx(
    'block min-h-12 w-full rounded-md border bg-surface px-3 py-2 text-base text-fg placeholder:text-muted-fg transition-[border-color,box-shadow] duration-120 md:min-h-11 md:text-ui',
    'hover:border-border-strong focus-visible:border-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
    invalid ? 'border-danger' : 'border-border-strong/70',
  )

/** A surface on the canvas: monitor white, one hairline ring (no layout space), the card radius. */
export const cardClasses = 'rounded-lg bg-surface ring-1 ring-border'

/** Inline text link: ink, underlined, so it is findable without an accent color. */
export const linkClasses = 'font-medium text-fg underline decoration-border-strong underline-offset-4 transition-colors duration-120 hover:decoration-fg'

/** aria wiring for an input rendered inside <Field>. */
export function fieldAria(id: string, opts: { error?: string; hasHint?: boolean }) {
  const describedBy = [opts.hasHint ? `${id}-hint` : null, opts.error ? `${id}-error` : null].filter(Boolean).join(' ')
  return {
    id,
    'aria-invalid': opts.error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  } as const
}
