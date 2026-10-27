import { Monitor, Moon, Sun } from 'lucide-react'
import { cx } from '../../lib/styles'
import { setTheme, useTheme, type ThemeChoice } from '../../lib/theme'

/** One-tap switch between light and dark, for the top bar (`tone="chrome"`) and the sign-in screens. */
export function ThemeToggle({ className, tone = 'surface' }: { className?: string; tone?: 'surface' | 'chrome' }) {
  const { theme } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  const Icon = theme === 'dark' ? Sun : Moon
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={cx(
        'flex size-10 items-center justify-center rounded-md transition-colors duration-120',
        tone === 'chrome' ? 'text-chrome-fg hover:bg-chrome-2 hover:text-chrome-strong' : 'text-muted-fg hover:bg-surface-2 hover:text-fg',
        className,
      )}
    >
      <Icon aria-hidden className="size-4.5" />
    </button>
  )
}

const CHOICES: Array<{ value: ThemeChoice; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Match device', icon: Monitor },
]

/** Light, dark, or follow the device setting (Account page): a segmented control. */
export function ThemePicker() {
  const { choice } = useTheme()
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Theme</legend>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1">
        {CHOICES.map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className={cx(
              'flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md px-2 text-center text-sm font-medium text-muted-fg transition-[background-color,color,box-shadow] duration-180 hover:text-fg',
              'has-checked:bg-surface has-checked:text-fg has-checked:shadow-sm has-checked:ring-1 has-checked:ring-border',
              'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
            )}
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={choice === value}
              onChange={() => setTheme(value)}
              className="sr-only"
            />
            <Icon aria-hidden className="size-4 shrink-0" />
            {label}
          </label>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted-fg">Saved on this device only.</p>
    </fieldset>
  )
}
