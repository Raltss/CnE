import { Database, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/toast-context'
import { useAppState } from '../data/hooks'
import { editors, managers } from '../data/selectors'
import { resetDemoData } from '../data/store'
import { useSession } from '../session/context'
import { HOME } from './nav'

/** Demo mode only: makes the demo explicit and switches between sample accounts. */
export function DemoBar() {
  const state = useAppState()
  const { me, switchAccount } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [confirmReset, setConfirmReset] = useState(false)

  const onSwitch = (personId: string) => {
    const person = state.people.find((p) => p.id === personId)
    if (!person) return
    switchAccount?.(person.id)
    navigate(HOME[person.role])
    toast.show(`Now viewing as ${person.name} (${person.role})`, 'info')
  }

  const reset = () => {
    setConfirmReset(false)
    resetDemoData?.()
    navigate(HOME[me.role])
    toast.show('Demo data reset to the original sample data')
  }

  return (
    <div className="border-b border-warning/40 bg-warning-bg">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/50 bg-surface px-2.5 py-0.5 text-xs font-bold text-warning">
          <Database aria-hidden className="size-3.5" />
          Demo data
        </span>
        <span className="hidden text-xs text-fg lg:inline">
          Prototype only: stored in this browser, with no real sign-in or security.
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label htmlFor="demo-account" className="text-xs font-semibold text-fg">
            Demo account
          </label>
          <select
            id="demo-account"
            value={me.id}
            onChange={(e) => onSwitch(e.target.value)}
            className="min-h-9 max-w-[13rem] rounded-md border border-border-strong bg-surface px-2 text-sm text-fg"
          >
            <optgroup label="Managers">
              {managers(state).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Manager)
                </option>
              ))}
            </optgroup>
            <optgroup label="Editors">
              {editors(state).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Editor)
                </option>
              ))}
            </optgroup>
            <optgroup label="Admin">
              {state.people
                .filter((p) => p.role === 'admin' && p.isActive)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Admin)
                  </option>
                ))}
            </optgroup>
          </select>
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-fg hover:bg-surface/70"
          >
            <RefreshCw aria-hidden className="size-3.5" />
            Reset demo data
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmReset}
        title="Reset demo data?"
        description="This erases every change made in this browser (packages, submissions, attendance, and notifications) and restores the original sample data. This can’t be undone."
        confirmLabel="Reset demo data"
        tone="danger"
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  )
}
