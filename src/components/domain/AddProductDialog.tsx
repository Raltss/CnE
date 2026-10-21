import { useState, type FormEvent } from 'react'
import { api } from '../../data/api'
import type { Product } from '../../data/types'
import { buttonClasses, fieldAria, inputClasses } from '../../lib/styles'
import { Dialog } from '../ui/Dialog'
import { Field } from '../ui/Field'
import { useToast } from '../ui/toast-context'

interface AddProductDialogProps {
  open: boolean
  onClose: () => void
  /** Called with the new product, e.g. to select it in the package form. */
  onAdded?: (product: Product) => void
}

/** Managers: add a product by name. Re-key it per opening so the field starts empty. */
export function AddProductDialog({ open, onClose, onAdded }: AddProductDialogProps) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const result = await api.createProduct(name)
    setBusy(false)
    if (!result.ok) {
      setError(result.fieldErrors?.name ?? result.error)
      document.getElementById('product-name')?.focus()
      return
    }
    toast.show(`Product “${result.value.name}” added`)
    onAdded?.(result.value)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add product"
      description="Products group packages, e.g. “Kapeng Barako Social Shorts”."
      footer={
        <>
          <button type="button" className={buttonClasses('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="add-product-form" disabled={busy} className={buttonClasses('primary')}>
            {busy ? 'Adding…' : 'Add product'}
          </button>
        </>
      }
    >
      <form id="add-product-form" noValidate onSubmit={submit}>
        <Field id="product-name" label="Product name" required error={error} hint="Up to 80 characters. Each name can be used once.">
          <input
            {...fieldAria('product-name', { error, hasHint: true })}
            autoComplete="off"
            maxLength={100}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(undefined)
            }}
            className={inputClasses(Boolean(error))}
          />
        </Field>
      </form>
    </Dialog>
  )
}
