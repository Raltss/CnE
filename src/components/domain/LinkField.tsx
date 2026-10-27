import { Copy, ExternalLink, type LucideIcon } from 'lucide-react'
import { useToast } from '../ui/toast-context'

interface LinkFieldProps {
  label: string
  icon: LucideIcon
  url: string | null
  emptyText?: string
}

/** A clearly labeled external link with open and copy actions. */
export function LinkField({ label, icon: Icon, url, emptyText = 'Not provided' }: LinkFieldProps) {
  const toast = useToast()
  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.show(`${label} copied`)
    } catch {
      toast.show('Couldn’t copy. Select the link text and copy it manually.', 'error')
    }
  }

  return (
    <div className="flex min-w-0 items-start gap-3 py-2.5">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-fg" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-fg">{label}</p>
        {url ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex min-w-0 items-center gap-1.5 text-ui font-medium text-fg underline decoration-border-strong underline-offset-4 transition-colors duration-120 hover:decoration-fg"
            >
              <span className="truncate">{url.replace(/^https?:\/\/(www\.)?/, '')}</span>
              <ExternalLink aria-hidden className="size-3.5 shrink-0 text-muted-fg" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <button
              type="button"
              onClick={copy}
              aria-label={`Copy ${label.toLowerCase()}`}
              title={`Copy ${label.toLowerCase()}`}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-fg transition-colors duration-120 hover:bg-surface-2 hover:text-fg"
            >
              <Copy aria-hidden className="size-3.5" />
            </button>
          </span>
        ) : (
          <p className="mt-0.5 text-ui text-muted-fg">{emptyText}</p>
        )}
      </div>
    </div>
  )
}
