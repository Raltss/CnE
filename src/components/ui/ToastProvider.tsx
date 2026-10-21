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
  success: { icon: CircleCheck, className: 'border-success text-success', label: 'Success' },
  error: { icon: CircleAlert, className: 'border-danger text-danger', label: 'Error' },
  info: { icon: Info, className: 'border-info text-info', label: 'Info' },
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
        className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-center gap-2 md:inset-x-auto md:right-6 md:bottom-6 md:items-end"
      >
        {toasts.map((t) => {
          const tone = TONE[t.tone]
          const Icon = tone.icon
          return (
            <div
              key={t.id}
              className={cx(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border-l-4 bg-surface p-3 text-sm text-fg shadow-lg ring-1 ring-border',
                tone.className,
              )}
            >
              <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
              <p className="flex-1 text-fg">
                <span className="sr-only">{tone.label}: </span>
                {t.message}
              </p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="-m-1 rounded p-1 text-muted-fg hover:bg-surface-2 hover:text-fg"
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
