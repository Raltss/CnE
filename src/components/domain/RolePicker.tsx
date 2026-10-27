import type { AssignableRole } from '../../data/types'
import { ROLE_META } from '../../lib/status'
import { cx } from '../../lib/styles'

const ROLE_HELP: Record<AssignableRole, string> = {
  manager: 'Creates and assigns packages, reviews submissions, and sees all work and attendance.',
  editor: 'Works on the packages assigned to them, submits links, and clocks in and out.',
}

interface RolePickerProps {
  value: AssignableRole
  onChange: (role: AssignableRole) => void
  /** Marks the person's current role when changing it. */
  current?: AssignableRole
  /** Radio group name; unique per form. */
  name?: string
}

/** Manager or editor, with what each can do. Admin access is never offered in the app. */
export function RolePicker({ value, onChange, current, name = 'staff-role' }: RolePickerProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Role</legend>
      {(['manager', 'editor'] as const).map((role) => {
        const Icon = ROLE_META[role].icon
        return (
          <label
            key={role}
            className={cx(
              'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors duration-120',
              value === role ? 'border-primary bg-primary/5' : 'border-border-strong hover:bg-surface-2',
            )}
          >
            <input
              type="radio"
              name={name}
              value={role}
              checked={value === role}
              onChange={() => onChange(role)}
              className="mt-1 size-4 accent-primary"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon aria-hidden className="size-4" />
                {ROLE_META[role].label}
                {current === role && <span className="text-xs font-normal text-muted-fg">(current)</span>}
              </span>
              <span className="mt-0.5 block text-xs text-muted-fg">{ROLE_HELP[role]}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
