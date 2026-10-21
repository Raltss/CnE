import { ArrowLeft, Lock, Plus, SearchX, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Callout } from '../../components/ui/Callout'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/Section'
import { useToast } from '../../components/ui/toast-context'
import { useAppState } from '../../data/hooks'
import { defaultResponsibleManagerId, editors, managers } from '../../data/selectors'
import { api } from '../../data/store'
import type { AppState, PackageInput, WorkPackage } from '../../data/types'
import { buttonClasses, cardClasses, cx, fieldAria, inputClasses } from '../../lib/styles'
import { DAY_MS, fromManilaInputValue, toManilaInputValue } from '../../lib/time'
import { useSession } from '../../session/context'

interface FormValues {
  title: string
  clientId: string
  productId: string
  description: string
  briefLink: string
  referenceLinks: string[]
  deliverables: string
  editorId: string
  responsibleManagerId: string
  deadline: string // datetime-local value, Manila time
}

function initialValues(pkg: WorkPackage | null): FormValues {
  if (pkg)
    return {
      title: pkg.title,
      clientId: pkg.clientId,
      productId: pkg.productId,
      description: pkg.description,
      briefLink: pkg.briefLink,
      referenceLinks: pkg.referenceLinks.length ? [...pkg.referenceLinks] : [''],
      deliverables: pkg.deliverables,
      editorId: pkg.editorId,
      responsibleManagerId: pkg.responsibleManagerId,
      deadline: toManilaInputValue(pkg.deadline),
    }
  // Suggest end of day (6 PM Manila) three days from now.
  const suggested = toManilaInputValue(new Date(Date.now() + 3 * DAY_MS).toISOString()).slice(0, 10) + 'T18:00'
  return {
    title: '',
    clientId: '',
    productId: '',
    description: '',
    briefLink: '',
    referenceLinks: [''],
    deliverables: '',
    editorId: '',
    responsibleManagerId: '',
    deadline: suggested,
  }
}

const omit = (errors: Record<string, string>, ...keys: string[]) =>
  Object.fromEntries(Object.entries(errors).filter(([k]) => !keys.includes(k)))

const FIELD_ORDER = ['title', 'clientId', 'productId', 'briefLink', 'referenceLinks', 'deliverables', 'editorId', 'responsibleManagerId', 'deadline']

export function PackageFormPage() {
  const { id } = useParams()
  const state = useAppState()
  const pkg = id ? (state.packages.find((p) => p.id === id) ?? null) : null

  if (id && !pkg)
    return (
      <EmptyState icon={SearchX} title="Package not found" tone="error" action={<Link to="/packages" className={buttonClasses('primary')}>Back to packages</Link>}>
        It may have been removed by a demo data reset.
      </EmptyState>
    )
  if (pkg?.status === 'completed')
    return (
      <EmptyState icon={Lock} title="Completed packages can’t be edited" action={<Link to={`/packages/${pkg.id}`} className={buttonClasses('primary')}>View package</Link>}>
        Reopening completed packages is planned for a later milestone.
      </EmptyState>
    )
  // Remount the form when switching between packages so its state resets.
  return <PackageForm key={pkg?.id ?? 'new'} state={state} pkg={pkg} />
}

function PackageForm({ state, pkg }: { state: AppState; pkg: WorkPackage | null }) {
  const { me } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [values, setValues] = useState<FormValues>(() => initialValues(pkg))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Track whether the manager picked the responsible manager by hand.
  const [managerTouched, setManagerTouched] = useState(Boolean(pkg))

  const products = state.products.filter((p) => p.clientId === values.clientId)
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key]) setErrors((e) => omit(e, key))
  }

  const onProduct = (productId: string) => {
    setValues((v) => ({
      ...v,
      productId,
      responsibleManagerId: managerTouched ? v.responsibleManagerId : (defaultResponsibleManagerId(state, productId) ?? v.responsibleManagerId),
    }))
    setErrors((e) => omit(e, 'productId', 'responsibleManagerId'))
  }

  const setRef = (index: number, value: string) => {
    setValues((v) => ({ ...v, referenceLinks: v.referenceLinks.map((l, i) => (i === index ? value : l)) }))
    if (errors[`referenceLinks.${index}`]) setErrors((e) => omit(e, `referenceLinks.${index}`))
  }
  const addRef = () => setValues((v) => ({ ...v, referenceLinks: [...v.referenceLinks, ''] }))
  const removeRef = (index: number) => {
    setValues((v) => ({ ...v, referenceLinks: v.referenceLinks.length > 1 ? v.referenceLinks.filter((_, i) => i !== index) : [''] }))
    // Indexes shift after removal, so clear reference link errors; they're re-checked on save.
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('referenceLinks.'))))
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    const deadline = fromManilaInputValue(values.deadline)
    const input: PackageInput = { ...values, deadline: deadline ?? '' }
    setSaving(true)
    const result = pkg ? await api.updatePackage(me.id, pkg.id, input) : await api.createPackage(me.id, input)
    setSaving(false)
    if (!result.ok) {
      const fieldErrors = { ...(result.fieldErrors ?? {}) } as Record<string, string>
      if (!deadline && values.deadline) fieldErrors.deadline = 'Enter a valid date and time.'
      setErrors(fieldErrors)
      setFormError(result.error)
      // Move focus to the first invalid field.
      const first = FIELD_ORDER.flatMap((k) => (k === 'referenceLinks' ? Object.keys(fieldErrors).filter((e) => e.startsWith(k)) : [k])).find(
        (k) => fieldErrors[k],
      )
      if (first) document.getElementById(`pkg-${first.replace('.', '-')}`)?.focus()
      return
    }
    toast.show(pkg ? 'Package updated' : `Package ${result.value.code} created and assigned`)
    navigate(`/packages/${result.value.id}`)
  }

  const err = (key: string) => errors[key]
  const editorChanged = pkg && values.editorId !== pkg.editorId

  return (
    <>
      <Link to={pkg ? `/packages/${pkg.id}` : '/packages'} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        {pkg ? 'Back to package' : 'Back to packages'}
      </Link>
      <PageHeader
        title={pkg ? `Edit ${pkg.code}` : 'New package'}
        description={pkg ? pkg.title : 'Create a package and assign it to one editor. The editor is notified right away.'}
      />

      <form noValidate onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-5">
        {formError && Object.keys(errors).length > 0 && (
          <Callout tone="danger" title="Couldn’t save the package">
            {formError} {Object.keys(errors).length} field{Object.keys(errors).length > 1 ? 's need' : ' needs'} attention.
          </Callout>
        )}

        <fieldset className={cx(cardClasses, 'flex flex-col gap-4 p-4')}>
          <legend className="sr-only">Details</legend>
          <h2 className="text-base font-semibold">Details</h2>
          <Field id="pkg-title" label="Title" required error={err('title')}>
            <input
              {...fieldAria('pkg-title', { error: err('title') })}
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              className={inputClasses(Boolean(err('title')))}
              maxLength={140}
              autoComplete="off"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="pkg-clientId" label="Client" required error={err('clientId')}>
              <select
                {...fieldAria('pkg-clientId', { error: err('clientId') })}
                value={values.clientId}
                onChange={(e) => {
                  set('clientId', e.target.value)
                  setValues((v) => ({ ...v, productId: '' }))
                }}
                className={inputClasses(Boolean(err('clientId')))}
              >
                <option value="">Choose a client</option>
                {state.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="pkg-productId" label="Product" required error={err('productId')} hint={!values.clientId ? 'Choose a client first.' : undefined}>
              <select
                {...fieldAria('pkg-productId', { error: err('productId'), hasHint: !values.clientId })}
                value={values.productId}
                onChange={(e) => onProduct(e.target.value)}
                disabled={!values.clientId}
                className={inputClasses(Boolean(err('productId')))}
              >
                <option value="">Choose a product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field id="pkg-description" label="Description / notes">
            <textarea
              id="pkg-description"
              rows={3}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              className={inputClasses()}
            />
          </Field>
          <Field id="pkg-deliverables" label="Deliverables" hint="Free text, e.g. “16:9 master, 9:16 cutdown, captions”.">
            <textarea
              {...fieldAria('pkg-deliverables', { hasHint: true })}
              rows={2}
              value={values.deliverables}
              onChange={(e) => set('deliverables', e.target.value)}
              className={inputClasses()}
            />
          </Field>
        </fieldset>

        <fieldset className={cx(cardClasses, 'flex flex-col gap-4 p-4')}>
          <legend className="sr-only">Links</legend>
          <div>
            <h2 className="text-base font-semibold">Links</h2>
            <p className="text-xs text-muted-fg">Links only. Videos and files stay on Frame.io, Google Drive, and similar services.</p>
          </div>
          <Field id="pkg-briefLink" label="Brief link" error={err('briefLink')}>
            <input
              {...fieldAria('pkg-briefLink', { error: err('briefLink') })}
              type="url"
              inputMode="url"
              placeholder="https://docs.google.com/…"
              value={values.briefLink}
              onChange={(e) => set('briefLink', e.target.value)}
              className={inputClasses(Boolean(err('briefLink')))}
            />
          </Field>
          <div>
            <p className="mb-1 flex items-baseline gap-2 text-sm font-medium" id="pkg-refs-label">
              Reference links <span className="text-xs font-normal text-muted-fg">Optional · add as many as needed</span>
            </p>
            <ul className="flex flex-col gap-2" aria-labelledby="pkg-refs-label">
              {values.referenceLinks.map((link, index) => {
                const key = `referenceLinks.${index}`
                const fid = `pkg-referenceLinks-${index}`
                return (
                  <li key={index}>
                    <div className="flex gap-2">
                      <label htmlFor={fid} className="sr-only">
                        Reference link {index + 1}
                      </label>
                      <input
                        {...fieldAria(fid, { error: err(key) })}
                        type="url"
                        inputMode="url"
                        placeholder="https://…"
                        value={link}
                        onChange={(e) => setRef(index, e.target.value)}
                        className={inputClasses(Boolean(err(key)))}
                      />
                      <button
                        type="button"
                        onClick={() => removeRef(index)}
                        className={buttonClasses('ghost', 'md', 'shrink-0 px-3')}
                        aria-label={`Remove reference link ${index + 1}`}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </div>
                    {err(key) && (
                      <p id={`${fid}-error`} className="mt-1 text-sm font-medium text-danger">
                        {err(key)}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
            <button type="button" onClick={addRef} className={buttonClasses('secondary', 'sm', 'mt-2')}>
              <Plus aria-hidden className="size-4" />
              Add reference link
            </button>
          </div>
        </fieldset>

        <fieldset className={cx(cardClasses, 'flex flex-col gap-4 p-4')}>
          <legend className="sr-only">Assignment and deadline</legend>
          <h2 className="text-base font-semibold">Assignment & deadline</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="pkg-editorId"
              label="Assigned editor"
              required
              error={err('editorId')}
              hint={editorChanged ? 'Both editors will be notified about the reassignment.' : 'One editor per package.'}
            >
              <select
                {...fieldAria('pkg-editorId', { error: err('editorId'), hasHint: true })}
                value={values.editorId}
                onChange={(e) => set('editorId', e.target.value)}
                className={inputClasses(Boolean(err('editorId')))}
              >
                <option value="">Choose an editor</option>
                {editors(state).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="pkg-responsibleManagerId"
              label="Responsible manager"
              required
              error={err('responsibleManagerId')}
              hint="Defaults to the product’s manager (or the client’s). Gets notified on submissions."
            >
              <select
                {...fieldAria('pkg-responsibleManagerId', { error: err('responsibleManagerId'), hasHint: true })}
                value={values.responsibleManagerId}
                onChange={(e) => {
                  setManagerTouched(true)
                  set('responsibleManagerId', e.target.value)
                }}
                className={inputClasses(Boolean(err('responsibleManagerId')))}
              >
                <option value="">Choose a manager</option>
                {managers(state).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field id="pkg-deadline" label="Final deadline (Manila time, PHT)" required error={err('deadline')} hint="Date and time in Asia/Manila.">
            <input
              {...fieldAria('pkg-deadline', { error: err('deadline'), hasHint: true })}
              type="datetime-local"
              value={values.deadline}
              onChange={(e) => set('deadline', e.target.value)}
              className={inputClasses(Boolean(err('deadline')))}
            />
          </Field>
        </fieldset>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link to={pkg ? `/packages/${pkg.id}` : '/packages'} className={buttonClasses('secondary')}>
            Cancel
          </Link>
          <button type="submit" disabled={saving} className={buttonClasses('primary')}>
            {saving ? 'Saving…' : pkg ? 'Save changes' : 'Create and assign'}
          </button>
        </div>
      </form>
    </>
  )
}
