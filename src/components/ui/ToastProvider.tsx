import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from '../../lib/styles'
import { ToastContext, type ToastTone } from './toast-context'

interface Toast {
  id: number
  message: string
  tone: ToastTone
}

const TONE = {
  success: { icon: CircleCheck, className: 'text-success', label: 'Success' },
  error: { icon: CircleAlert, className: 'text-danger', label: 'Error' },
  info: { icon: Info, className: 'text-info', label: 'Info' },
} as const

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])
  const show = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      nextId.current += 1
      const id = nextId.current
      setToasts((list) => [...list.slice(-2), { id, message, tone }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 4000)
    },
    [dismiss],
  )
  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col items-center gap-2 md:inset-x-auto md:right-6 md:bottom-6 md:items-end"
      >
        {toasts.map((t) => {
          const tone = TONE[t.tone]
          const Icon = tone.icon
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex w-full max-w-sm animate-rise-in items-start gap-3 rounded-xl bg-surface py-3 pr-3 pl-4 text-ui text-fg shadow-xl ring-1 ring-border"
            >
              <Icon aria-hidden className={cx('mt-0.5 size-4 shrink-0', tone.className)} />
              <p className="flex-1">
                <span className="sr-only">{tone.label}: </span>
                {t.message}
              </p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="-my-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-fg transition-colors duration-120 hover:bg-surface-2 hover:text-fg"
                aria-label="Dismiss notification"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
