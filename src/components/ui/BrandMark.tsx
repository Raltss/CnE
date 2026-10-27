import { cx } from '../../lib/styles'

/** The CnE mark: a playhead (flag and line) beside the wordmark. Decorative; pair with a text label. */
export function BrandMark({ className, wordmark = true }: { className?: string; wordmark?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <svg aria-hidden viewBox="0 0 16 20" className="h-5 w-4 shrink-0">
        <rect x="2" y="0" width="12" height="7" rx="2" className="fill-now" />
        <rect x="7" y="5" width="2" height="15" rx="1" className="fill-now" />
      </svg>
      {wordmark && <span className="text-lg leading-none font-semibold tracking-tight">CnE</span>}
    </span>
  )
}
