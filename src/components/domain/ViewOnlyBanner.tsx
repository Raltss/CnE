import { Eye } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Marks admin oversight pages as read-only. The admin always acts as
 * themselves; package and attendance changes belong to managers and editors.
 */
export function ViewOnlyBanner({ children }: { children?: ReactNode }) {
  return (
    <div role="note" className="mb-5 flex items-start gap-3 rounded-lg border border-info/40 bg-info-bg px-3 py-2.5 text-sm">
      <Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
      <p className="text-fg">
        <span className="font-semibold">View only.</span>{' '}
        {children ?? 'You’re seeing everyone’s work as an admin. Packages and attendance are changed only by managers and editors.'}
      </p>
    </div>
  )
}
