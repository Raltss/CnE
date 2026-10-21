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
    <div className="flex min-w-0 items-start gap-3 py-2">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-fg">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wide text-muted-fg uppercase">{label}</p>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex max-w-full items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            <span className="truncate">{url}</span>
            <ExternalLink aria-hidden className="size-3.5 shrink-0" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <p className="text-sm text-muted-fg italic">{emptyText}</p>
        )}
      </div>
      {url && (
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-fg hover:bg-surface-2 hover:text-fg"
        >
          <Copy aria-hidden className="size-4" />
        </button>
      )}
    </div>
  )
}
