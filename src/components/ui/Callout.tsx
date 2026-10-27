import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../../lib/styles'

// Notes sit on a quiet sunken surface with a colored icon; only errors get a tinted ground.
const TONES = {
  info: { icon: Info, className: 'bg-surface-2', iconClass: 'text-info', label: 'Note' },
  warning: { icon: TriangleAlert, className: 'bg-warning-bg', iconClass: 'text-warning', label: 'Heads up' },
  danger: { icon: CircleAlert, className: 'bg-danger-bg', iconClass: 'text-danger', label: 'Error' },
} as const

export function Callout({ tone = 'info', title, children }: { tone?: keyof typeof TONES; title?: string; children: ReactNode }) {
  const t = TONES[tone]
  const Icon = t.icon
  return (
    <div className={cx('flex gap-3 rounded-lg px-5 py-3.5 text-ui', t.className)} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon aria-hidden className={cx('mt-0.5 size-4 shrink-0', t.iconClass)} />
      <div className="min-w-0 text-fg">
        <p className="font-medium">{title ?? t.label}</p>
        <div className="mt-0.5 text-muted-fg">{children}</div>
      </div>
    </div>
  )
}
