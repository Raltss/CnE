import { Eye } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Marks admin oversight pages as read-only. The admin always acts as
 * themselves; package and attendance changes belong to managers and editors.
 */
export function ViewOnlyBanner({ children }: { children?: ReactNode }) {
  return (
    <div role="note" className="mb-6 flex items-start gap-3 rounded-lg bg-surface-2 px-4 py-3 text-sm">
      <Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
      <p className="text-muted-fg">
        <span className="font-medium text-fg">View only.</span>{' '}
        {children ?? 'You’re seeing everyone’s work as an admin. Packages and attendance are changed only by managers and editors.'}
      </p>
    </div>
  )
}
