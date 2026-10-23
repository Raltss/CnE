import { ArrowLeft, Lock, Plus, SearchX, Trash2 } from 'lucide-react'
import { StatusBadge } from '../../components/domain/StatusBadge'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { AddProductDialog } from '../../components/domain/AddProductDialog'
import { Callout } from '../../components/ui/Callout'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field } from '../../components/ui/Field'
import { PageStatus } from '../../components/ui/PageStatus'
import { PageHeader } from '../../components/ui/Section'
import { useToast } from '../../components/ui/toast-context'
import { api } from '../../data/api'
import { pageStatus, useDirectory, usePackage } from '../../data/queries'
import { editors, managers } from '../../data/selectors'
import type { PackageInput, Person, Product, WorkPackage } from '../../data/types'
import { FIXED_ASSIGNMENT_STATUSES } from '../../data/validation'
import { buttonClasses, cardClasses, cx, fieldAria, inputClasses } from '../../lib/styles'
import { useBack } from '../../lib/back'
import { DAY_MS, formatDateTime, fromManilaInputValue, toManilaInputValue } from '../../lib/time'
import { useSession } from '../../session/context'

interface FormValues {
  title: string
  productId: string
  description: string
  briefLink: string
  referenceLinks: string[]
  deliverables: string
  editorId: string
  responsibleManagerId: string
  deadline: string // datetime-local value, Manila time
}

function initialValues(pkg: WorkPackage | null, meId: string): FormValues {
  if (pkg)
    return {
      title: pkg.title,
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
    productId: '',
    description: '',
    briefLink: '',
    referenceLinks: [''],
    deliverables: '',
    editorId: '',
    // The manager creating the package is responsible until they pick someone else.
    responsibleManagerId: meId,
    deadline: suggested,
  }
}

const omit = (errors: Record<string, string>, ...keys: string[]) =>
  Object.fromEntries(Object.entries(errors).filter(([k]) => !keys.includes(k)))

const FIELD_ORDER = ['title', 'productId', 'briefLink', 'referenceLinks', 'deliverables', 'editorId', 'responsibleManagerId', 'deadline']

/** Active people to choose from, plus whoever holds the role now if they've since been deactivated. */
function choices(active: Person[], people: Person[], currentId: string | undefined) {
  const current = people.find((p) => p.id === currentId)
  return current && !active.includes(current) ? [...active, current] : active
}

export function PackageFormPage() {
  const { id } = useParams()
  const detail = usePackage(id)
  const { people, products, queries } = useDirectory()
  const status = pageStatus(...queries, ...(id ? [detail] : []))
  if (status.pending || status.error) return <PageStatus {...status} />
  const pkg = id ? (detail.data?.pkg ?? null) : null

  if (id && !pkg)
    return (
      <EmptyState icon={SearchX} title="Package not found" tone="error" action={<Link to="/packages" className={buttonClasses('primary')}>Back to packages</Link>}>
        It may have been removed, or the link is wrong.
      </EmptyState>
    )
  if (pkg?.status === 'archived')
    return (
      <EmptyState icon={Lock} title="Archived packages can’t be edited" action={<Link to={`/packages/${pkg.id}`} className={buttonClasses('primary')}>View package</Link>}>
        Unarchive it from the package page first.
      </EmptyState>
    )
  // Remount the form when switching between packages so its state resets.
  return <PackageForm key={pkg?.id ?? 'new'} people={people} products={products} pkg={pkg} />
}

function PackageForm({ people, products, pkg }: { people: Person[]; products: Product[]; pkg: WorkPackage | null }) {
  const { me } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  // Back, Cancel, and saving an edit return to whichever page opened the form (the
  // Packages list with its filters, or the package); a direct link falls back to these.
  const back = useBack(pkg ? { to: `/packages/${pkg.id}`, label: 'Package' } : { to: '/packages', label: 'Packages' })
  const [values, setValues] = useState<FormValues>(() => initialValues(pkg, me.id))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // A new key per opening, so the Add product field starts empty.
  const [addingProduct, setAddingProduct] = useState<number | null>(null)
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key]) setErrors((e) => omit(e, key))
  }

  // Completed and cancelled packages: details only (same rule as update_package).
  const fixed = pkg && FIXED_ASSIGNMENT_STATUSES.includes(pkg.status) ? pkg : null

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
    // A finished package keeps its editor and deadline exactly as stored.
    const deadline = fixed ? fixed.deadline : fromManilaInputValue(values.deadline)
    const input: PackageInput = { ...values, ...(fixed && { editorId: fixed.editorId }), deadline: deadline ?? '' }
    setSaving(true)
    const result = pkg ? await api.updatePackage(pkg, input) : await api.createPackage(input)
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
    if (pkg) {
      toast.show('Package updated')
      back.go()
      return
    }
    toast.show('code' in result.value ? `Package ${result.value.code} created and assigned` : 'Package created and assigned')
    // The new package takes the form's place in history, so Back from it returns to
    // where the form was opened instead of to a form that was already sent.
    navigate(`/packages/${result.value.id}`, { replace: true, state: location.state })
  }

  const err = (key: string) => errors[key]
  const editorChanged = pkg && values.editorId !== pkg.editorId

  return (
    <>
      <Link to={back.to} onClick={back.onClick} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Back to {back.label.toLowerCase()}
      </Link>
      <PageHeader
        title={pkg ? `Edit ${pkg.code}` : 'New package'}
        description={pkg ? pkg.title : 'Create a package and assign it to one editor. The editor is notified right away.'}
        actions={pkg && <StatusBadge status={pkg.status} />}
      />

      <form noValidate onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-5">
        {/* Field problems are listed under each field; a refusal about the package as a whole shows only here. */}
        {formError && (
          <Callout tone="danger" title="Couldn’t save the package">
            {formError}
            {Object.keys(errors).length > 0 && ` ${Object.keys(errors).length} field${Object.keys(errors).length > 1 ? 's need' : ' needs'} attention.`}
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
          <Field
            id="pkg-productId"
            label="Product"
            required
            error={err('productId')}
            hint={products.length ? undefined : 'No products yet. Add the first one.'}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                {...fieldAria('pkg-productId', { error: err('productId'), hasHint: !products.length })}
                value={values.productId}
                onChange={(e) => set('productId', e.target.value)}
                className={inputClasses(Boolean(err('productId')))}
              >
                <option value="">Choose a product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-haspopup="dialog"
                className={buttonClasses('secondary', 'md', 'shrink-0')}
                onClick={() => setAddingProduct(Date.now())}
              >
                <Plus aria-hidden className="size-4" />
                New product
              </button>
            </div>
          </Field>
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
          {fixed && (
            <Callout tone="info" title={`The editor and deadline stay as they are on a ${fixed.status === 'completed' ? 'completed' : 'cancelled'} package`}>
              {fixed.status === 'completed' ? 'Reopen the package to change them. ' : ''}You can still change the details, links, and responsible manager.
            </Callout>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {fixed ? (
              <LockedValue label="Assigned editor" value={people.find((p) => p.id === fixed.editorId)?.name ?? 'Unknown'} />
            ) : (
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
                  {choices(editors(people), people, pkg?.editorId).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {!p.isActive && ' (deactivated)'}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field
              id="pkg-responsibleManagerId"
              label="Responsible manager"
              required
              error={err('responsibleManagerId')}
              hint="Starts as you; change it if another manager should handle reviews. Gets notified on submissions."
            >
              <select
                {...fieldAria('pkg-responsibleManagerId', { error: err('responsibleManagerId'), hasHint: true })}
                value={values.responsibleManagerId}
                onChange={(e) => set('responsibleManagerId', e.target.value)}
                className={inputClasses(Boolean(err('responsibleManagerId')))}
              >
                <option value="">Choose a manager</option>
                {choices(managers(people), people, pkg?.responsibleManagerId).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.isActive && ' (deactivated)'}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {fixed ? (
            <LockedValue label="Final deadline (Manila time, PHT)" value={formatDateTime(fixed.deadline)} />
          ) : (
            <Field id="pkg-deadline" label="Final deadline (Manila time, PHT)" required error={err('deadline')} hint="Date and time in Asia/Manila.">
              <input
                {...fieldAria('pkg-deadline', { error: err('deadline'), hasHint: true })}
                type="datetime-local"
                value={values.deadline}
                onChange={(e) => set('deadline', e.target.value)}
                className={inputClasses(Boolean(err('deadline')))}
              />
            </Field>
          )}
        </fieldset>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link to={back.to} onClick={back.onClick} className={buttonClasses('secondary')}>
            Cancel
          </Link>
          <button type="submit" disabled={saving} className={buttonClasses('primary')}>
            {saving ? 'Saving…' : pkg ? 'Save changes' : 'Create and assign'}
          </button>
        </div>
      </form>

      {addingProduct !== null && (
        <AddProductDialog key={addingProduct} open onClose={() => setAddingProduct(null)} onAdded={(product) => set('productId', product.id)} />
      )}
    </>
  )
}

/** A value that can't be changed here, shown as text with a lock instead of a disabled control. */
function LockedValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{label}</p>
      <p className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-sm">
        <Lock aria-hidden className="size-4 shrink-0 text-muted-fg" />
        <span>{value}</span>
        <span className="sr-only">(locked)</span>
      </p>
    </div>
  )
}
