import { Check, PackageOpen, Pencil, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { api } from '../../data/api'
import { useProducts } from '../../data/queries'
import type { Product } from '../../data/types'
import { validateIncludedRevisions } from '../../data/validation'
import { buttonClasses, fieldAria, inputClasses } from '../../lib/styles'
import { Dialog } from '../ui/Dialog'
import { EmptyState } from '../ui/EmptyState'
import { Field } from '../ui/Field'
import { PageStatus } from '../ui/PageStatus'
import { useToast } from '../ui/toast-context'

const REVISIONS_HINT = 'Client revisions included, e.g. in the contract. Leave empty for no limit.'

const allowanceText = (included: number | null) =>
  included === null ? 'No revision limit' : `${included} client ${included === 1 ? 'revision' : 'revisions'} included`

/** Managers: add products, rename them, and set how many client revisions each includes. Re-key it per opening. */
export function ProductsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const products = useProducts()
  const [editing, setEditing] = useState<string | null>(null)
  // Back to the row's Edit button, so keyboard users don't lose their place.
  const finishEditing = (productId: string) => {
    setEditing(null)
    requestAnimationFrame(() => document.getElementById(`edit-${productId}`)?.focus())
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Products"
      description="Products group packages. Changes apply to every package that uses the product."
      footer={
        <button type="button" className={buttonClasses('secondary')} onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        <AddProductForm />
        {products.data === undefined ? (
          <PageStatus error={products.error?.message} retry={() => void products.refetch()} />
        ) : products.data.length ? (
          <ul aria-label="Products" className="-mx-1 divide-y divide-border">
            {products.data.map((product) =>
              editing === product.id ? (
                <li key={product.id} className="px-1 py-3">
                  <EditProductForm product={product} onDone={() => finishEditing(product.id)} />
                </li>
              ) : (
                <li key={product.id} className="flex min-h-14 items-center justify-between gap-3 px-1 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{product.name}</span>
                    <span className="block text-xs text-muted-fg tabular-nums">{allowanceText(product.includedRevisions)}</span>
                  </span>
                  <button
                    id={`edit-${product.id}`}
                    type="button"
                    className={buttonClasses('ghost', 'sm', 'shrink-0')}
                    aria-label={`Edit ${product.name}`}
                    onClick={() => setEditing(product.id)}
                  >
                    <Pencil aria-hidden className="size-4" />
                    Edit
                  </button>
                </li>
              ),
            )}
          </ul>
        ) : (
          <EmptyState icon={PackageOpen} title="No products yet" compact>
            Add the first one above.
          </EmptyState>
        )}
      </div>
    </Dialog>
  )
}

/** Name and included-revisions fields shared by the add and edit forms. */
function ProductFields({
  idPrefix,
  name,
  revisions,
  errors,
  onName,
  onRevisions,
  nameLabel,
  autoFocus,
}: {
  idPrefix: string
  name: string
  revisions: string
  errors: { name?: string; revisions?: string }
  onName: (value: string) => void
  onRevisions: (value: string) => void
  nameLabel: string
  /** The edit form replaces the row whose Edit button was pressed, so focus moves into it. */
  autoFocus?: boolean
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
      <Field id={`${idPrefix}-name`} label={nameLabel} required error={errors.name}>
        <input
          {...fieldAria(`${idPrefix}-name`, { error: errors.name })}
          autoFocus={autoFocus}
          autoComplete="off"
          maxLength={100}
          value={name}
          placeholder="e.g. Kapeng Barako Social Shorts"
          onChange={(e) => onName(e.target.value)}
          className={inputClasses(Boolean(errors.name))}
        />
      </Field>
      <Field id={`${idPrefix}-revisions`} label="Revisions" error={errors.revisions}>
        <input
          {...fieldAria(`${idPrefix}-revisions`, { error: errors.revisions, hasHint: true })}
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          step={1}
          value={revisions}
          placeholder="No limit"
          onChange={(e) => onRevisions(e.target.value)}
          className={inputClasses(Boolean(errors.revisions))}
        />
      </Field>
      <p id={`${idPrefix}-revisions-hint`} className="-mt-1 text-xs text-muted-fg sm:col-span-2">
        {REVISIONS_HINT}
      </p>
    </div>
  )
}

function AddProductForm() {
  const toast = useToast()
  const [name, setName] = useState('')
  const [revisions, setRevisions] = useState('')
  const [errors, setErrors] = useState<{ name?: string; revisions?: string }>({})
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const included = validateIncludedRevisions(revisions)
    if (included.error) {
      setErrors({ revisions: included.error })
      document.getElementById('new-product-revisions')?.focus()
      return
    }
    setBusy(true)
    const result = await api.createProduct(name, included.value)
    setBusy(false)
    if (!result.ok) {
      setErrors({ name: result.fieldErrors?.name ?? result.error })
      document.getElementById('new-product-name')?.focus()
      return
    }
    toast.show(`Product “${result.value.name}” added`)
    setName('')
    setRevisions('')
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3 rounded-lg bg-surface-2 p-3">
      <ProductFields
        idPrefix="new-product"
        nameLabel="New product"
        name={name}
        revisions={revisions}
        errors={errors}
        onName={(value) => {
          setName(value)
          setErrors((e) => ({ ...e, name: undefined }))
        }}
        onRevisions={(value) => {
          setRevisions(value)
          setErrors((e) => ({ ...e, revisions: undefined }))
        }}
      />
      <button type="submit" disabled={busy} className={buttonClasses('primary', 'md', 'self-end')}>
        <Plus aria-hidden className="size-4" />
        {busy ? 'Adding…' : 'Add product'}
      </button>
    </form>
  )
}

function EditProductForm({ product, onDone }: { product: Product; onDone: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(product.name)
  const [revisions, setRevisions] = useState(product.includedRevisions === null ? '' : String(product.includedRevisions))
  const [errors, setErrors] = useState<{ name?: string; revisions?: string }>({})
  const [busy, setBusy] = useState(false)
  const idPrefix = `edit-product-${product.id}`

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const included = validateIncludedRevisions(revisions)
    if (included.error) {
      setErrors({ revisions: included.error })
      document.getElementById(`${idPrefix}-revisions`)?.focus()
      return
    }
    if (name.trim() === product.name && included.value === product.includedRevisions) return onDone()
    setBusy(true)
    const result = await api.updateProduct(product.id, name, included.value)
    setBusy(false)
    if (!result.ok) {
      setErrors({ name: result.fieldErrors?.name ?? result.error })
      document.getElementById(`${idPrefix}-name`)?.focus()
      return
    }
    toast.show(`Saved “${result.value.name}”`)
    onDone()
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label={`Edit ${product.name}`}
      className="flex flex-col gap-3"
      onKeyDown={(e) => {
        // Esc cancels the edit instead of closing the whole dialog.
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        onDone()
      }}
    >
      <ProductFields
        idPrefix={idPrefix}
        autoFocus
        nameLabel={`Name of “${product.name}”`}
        name={name}
        revisions={revisions}
        errors={errors}
        onName={(value) => {
          setName(value)
          setErrors((e) => ({ ...e, name: undefined }))
        }}
        onRevisions={(value) => {
          setRevisions(value)
          setErrors((e) => ({ ...e, revisions: undefined }))
        }}
      />
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonClasses('secondary')} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={buttonClasses('primary')}>
          <Check aria-hidden className="size-4" />
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
