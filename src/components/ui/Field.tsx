import type { ReactNode } from 'react'

interface FieldProps {
  id: string
  label: string
  required?: boolean
  hint?: ReactNode
  error?: string
  children: ReactNode
  className?: string
}

/** Visible label above, hint below, inline error under the control. */
export function Field({ id, label, required, hint, error, children, className }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-2 text-sm font-medium text-fg">
        {label}
        {required ? (
          <span className="text-xs font-normal text-muted-fg">Required</span>
        ) : (
          <span className="text-xs font-normal text-muted-fg">Optional</span>
        )}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted-fg">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
