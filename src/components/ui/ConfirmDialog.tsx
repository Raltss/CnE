import type { ReactNode } from 'react'
import { buttonClasses } from '../../lib/styles'
import { Dialog } from './Dialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, description, confirmLabel, tone = 'primary', onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <>
          <button type="button" className={buttonClasses('secondary')} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={buttonClasses(tone === 'danger' ? 'danger' : 'primary')} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    />
  )
}
