import { inputClasses } from '../../lib/styles'

interface FilterSelectProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  /** Label of the empty "no filter" option. Omit when a value is always chosen. */
  all?: string
}

/** Labeled select for filter bars; the value lives in the URL. */
export function FilterSelect({ id, label, value, onChange, options, all }: FilterSelectProps) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-muted-fg">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClasses()}>
        {all !== undefined && <option value="">{all}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
