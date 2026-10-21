import { Clapperboard, Truck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { api } from '../../data/store'
import type { WorkPackage } from '../../data/types'
import { buttonClasses, fieldAria, inputClasses } from '../../lib/styles'
import { Callout } from '../ui/Callout'
import { Field } from '../ui/Field'
import { useToast } from '../ui/toast-context'

interface SubmissionFormProps {
  pkg: WorkPackage
  editorId: string
  managerName: string
  nextRound: number
}

/** Editor submits links for a new round. At least one link is required. */
export function SubmissionForm({ pkg, editorId, managerName, nextRound }: SubmissionFormProps) {
  const toast = useToast()
  const [reviewLink, setReviewLink] = useState('')
  const [deliveryLink, setDeliveryLink] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const result = await api.submitForReview(editorId, pkg.id, { reviewLink, deliveryLink })
    setBusy(false)
    if (!result.ok) {
      const fieldErrors = result.fieldErrors ?? { form: result.error }
      setErrors(fieldErrors)
      document.getElementById(fieldErrors.reviewLink || fieldErrors.form ? 'sub-review' : 'sub-delivery')?.focus()
      return
    }
    setErrors({})
    setReviewLink('')
    setDeliveryLink('')
    toast.show(`Round ${nextRound} submitted. ${managerName} has been notified.`)
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3" aria-labelledby="sub-title">
      <div>
        <h3 id="sub-title" className="font-semibold">
          {pkg.status === 'apply_feedback' ? `Resubmit (Round ${nextRound})` : `Submit for review (Round ${nextRound})`}
        </h3>
        <p className="text-xs text-muted-fg">
          Add a review link, a delivery link, or both. Paste links from Frame.io, Google Drive, or similar services; videos aren’t
          uploaded here.
        </p>
      </div>
      {errors.form && <Callout tone="danger" title="Add at least one link">{errors.form}</Callout>}
      <Field id="sub-review" label="Review link" error={errors.reviewLink} hint="Where the manager reviews and comments, e.g. Frame.io.">
        <div className="relative">
          <Clapperboard aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-fg" />
          <input
            {...fieldAria('sub-review', { error: errors.reviewLink, hasHint: true })}
            type="url"
            inputMode="url"
            placeholder="https://f.io/…"
            value={reviewLink}
            onChange={(e) => setReviewLink(e.target.value)}
            className={`${inputClasses(Boolean(errors.reviewLink || errors.form))} pl-9`}
          />
        </div>
      </Field>
      <Field
        id="sub-delivery"
        label="Delivery link"
        error={errors.deliveryLink}
        hint="Final files, e.g. a Google Drive folder. Optional now, but the package can only be approved once a round has one."
      >
        <div className="relative">
          <Truck aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-fg" />
          <input
            {...fieldAria('sub-delivery', { error: errors.deliveryLink, hasHint: true })}
            type="url"
            inputMode="url"
            placeholder="https://drive.google.com/…"
            value={deliveryLink}
            onChange={(e) => setDeliveryLink(e.target.value)}
            className={`${inputClasses(Boolean(errors.deliveryLink || errors.form))} pl-9`}
          />
        </div>
      </Field>
      <button type="submit" disabled={busy} className={buttonClasses('primary', 'md', 'w-full')}>
        {busy ? 'Submitting…' : pkg.status === 'apply_feedback' ? 'Resubmit for review' : 'Submit for review'}
      </button>
    </form>
  )
}
