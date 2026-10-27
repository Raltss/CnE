// All display formatting is pinned to Asia/Manila (UTC+8, no DST).
export const MANILA_TZ = 'Asia/Manila'
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

const dateTimeFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: MANILA_TZ,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const dateFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: MANILA_TZ,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
const shortDateFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: MANILA_TZ,
  month: 'short',
  day: 'numeric',
})
const timeFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: MANILA_TZ,
  hour: 'numeric',
  minute: '2-digit',
})
const clockFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: MANILA_TZ,
  hour: 'numeric',
  minute: '2-digit',
})
const dateKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: MANILA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export const formatDateTime = (iso: string) => `${dateTimeFmt.format(new Date(iso))} PHT`
export const formatDate = (iso: string) => dateFmt.format(new Date(iso))
export const formatShortDate = (iso: string) => shortDateFmt.format(new Date(iso))
export const formatTime = (iso: string) => timeFmt.format(new Date(iso))
/** "3:21 PM" Manila time, for the top bar, the playhead flags and the clocks. */
export const formatClock = (date: Date) => clockFmt.format(date)

/** Manila calendar date as YYYY-MM-DD. */
export const manilaDateKey = (iso: string) => dateKeyFmt.format(new Date(iso))

/** ISO instant → value for <input type="datetime-local"> interpreted as Manila time. */
export function toManilaInputValue(iso: string): string {
  return new Date(new Date(iso).getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 16)
}

/** <input type="datetime-local"> value entered in Manila time → ISO instant, or null if invalid. */
export function fromManilaInputValue(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00+08:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const dueTimeFmt = new Intl.DateTimeFormat('en-PH', { timeZone: MANILA_TZ, hour: 'numeric', minute: '2-digit' })
const dueDayFmt = new Intl.DateTimeFormat('en-PH', { timeZone: MANILA_TZ, weekday: 'short', day: 'numeric', month: 'short' })
const dueYearFmt = new Intl.DateTimeFormat('en-PH', { timeZone: MANILA_TZ, day: 'numeric', month: 'short', year: 'numeric' })

/** A deadline the way people say it: "Today, 6:00 PM", "Tomorrow, 12:00 PM", "Wed, 28 Oct, 5:00 PM" (Manila). */
export function formatDue(iso: string, now: Date): string {
  const key = manilaDateKey(iso)
  const today = manilaDateKey(now.toISOString())
  const time = dueTimeFmt.format(new Date(iso))
  if (key === today) return `Today, ${time}`
  if (key === addDays(today, 1)) return `Tomorrow, ${time}`
  if (key === addDays(today, -1)) return `Yesterday, ${time}`
  if (key.slice(0, 4) !== today.slice(0, 4)) return `${dueYearFmt.format(new Date(iso))}, ${time}`
  return `${dueDayFmt.format(new Date(iso))}, ${time}`
}

/** formatDue for the middle of a sentence: "due tomorrow, 12:00 PM". */
export const formatDueInline = (iso: string, now: Date) => formatDue(iso, now).replace(/^(Today|Tomorrow|Yesterday)/, (word) => word.toLowerCase())

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

/** Compact distance such as "3d 4h", "5h 12m", or "18m". */
export function formatDistance(ms: number): string {
  const totalMinutes = Math.floor(Math.abs(ms) / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS

// ── Manila calendar days (YYYY-MM-DD keys) ──────────────────────────────────

const KEY = /^\d{4}-\d{2}-\d{2}$/
export const isDateKey = (value: string | null): value is string => Boolean(value && KEY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)))

/** The key `days` days after (or before) another; plain calendar arithmetic. */
export function addDays(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (key: string) => (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7

/** The Monday of the week that contains this Manila date. */
export const mondayOf = (key: string) => addDays(key, -weekdayIndex(key))

/** The instant a Manila calendar day starts (00:00 PHT), as ISO. */
export const manilaDayStart = (key: string) => new Date(`${key}T00:00:00+08:00`).toISOString()

const dayHeaderFmt = new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
const dayRangeFmt = new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
/** "Mon, Oct 20" for a date key (the key is already a Manila date). */
export const formatDayKey = (key: string) => dayHeaderFmt.format(new Date(`${key}T00:00:00Z`))
/** "Oct 20 – Oct 26, 2026" for two date keys, both inclusive. */
export const formatDayRange = (first: string, last: string) =>
  dayRangeFmt.formatRange(new Date(`${first}T00:00:00Z`), new Date(`${last}T00:00:00Z`))
