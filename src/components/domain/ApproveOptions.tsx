import { CircleCheck, Send } from 'lucide-react'
import { completionBlocker } from '../../data/selectors'
import type { RoundSummary } from '../../data/types'
import { cx } from '../../lib/styles'
import type { ApproveMode } from './approve'

/** Sending to the client always works; completing needs a delivery link (PRD default). */
export function ApproveOptions({ latest, value, onChange }: { latest: RoundSummary | null; value: ApproveMode; onChange: (mode: ApproveMode) => void }) {
  const blocker = completionBlocker(latest)
  const options = [
    {
      mode: 'client' as const,
      icon: Send,
      title: 'Send to the client',
      text: `Approves Round ${latest?.round ?? 1} internally. Record the client’s decision when they reply.`,
      disabled: null,
    },
    {
      mode: 'complete' as const,
      icon: CircleCheck,
      title: 'Approve and complete',
      text: 'No client review needed. The package is marked Completed.',
      disabled: blocker,
    },
  ]
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">How should this round be approved?</legend>
      <div className="flex flex-col gap-2">
        {options.map(({ mode, icon: Icon, title, text, disabled }) => (
          <label
            key={mode}
            className={cx(
              'flex gap-3 rounded-lg border p-3 transition-colors duration-150',
              disabled ? 'cursor-not-allowed border-border opacity-70' : 'cursor-pointer border-border-strong hover:bg-surface-2',
              'has-checked:border-primary has-checked:bg-primary/5',
              'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
            )}
          >
            <input
              type="radio"
              name="approve-mode"
              value={mode}
              checked={value === mode}
              disabled={Boolean(disabled)}
              onChange={() => onChange(mode)}
              aria-describedby={`approve-${mode}-text`}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon aria-hidden className="size-4 shrink-0" />
                {title}
              </span>
              <span id={`approve-${mode}-text`} className="mt-0.5 block text-sm text-muted-fg">
                {disabled ?? text}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
