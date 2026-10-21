import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../../lib/styles'

const TONES = {
  info: { icon: Info, className: 'border-info/40 bg-info-bg text-info', label: 'Note' },
  warning: { icon: TriangleAlert, className: 'border-warning/40 bg-warning-bg text-warning', label: 'Heads up' },
  danger: { icon: CircleAlert, className: 'border-danger/40 bg-danger-bg text-danger', label: 'Error' },
} as const

export function Callout({ tone = 'info', title, children }: { tone?: keyof typeof TONES; title?: string; children: ReactNode }) {
  const t = TONES[tone]
  const Icon = t.icon
  return (
    <div className={cx('flex gap-3 rounded-lg border p-3 text-sm', t.className)} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="text-fg">
        <p className="font-semibold">{title ?? t.label}</p>
        <div className="mt-0.5 text-fg/90">{children}</div>
      </div>
    </div>
  )
}
